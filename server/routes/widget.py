from flask import Blueprint, request, jsonify, current_app
from models.conversation import ConversationModel
from models.message import MessageModel
from utils.request_helpers import get_organization_id_from_request
from utils.request_helpers import get_account_id_from_request as _get_account_id_from_request
from utils.request_helpers import get_chatbot_id_from_request
from flask_cors import cross_origin
from datetime import datetime
import uuid
import logging
import threading
import requests
from routes.facebook import _emit_socket, EXTERNAL_CHAT_API
from routes.zalo import _send_message_to_zalo

widget_bp = Blueprint('widget', __name__)
logger = logging.getLogger(__name__)


def _auto_reply_worker_widget(mongo_client, oa_id, customer_id, conversation_id, question, organization_id, socketio=None):
    """Background worker: call external chat API and send reply back to widget conversation.
    
    This mirrors the Facebook/Zalo auto-reply workers but sends the answer
    as an outgoing widget message stored in our DB and broadcast via Socket.IO.
    """
    try:
        if not question:
            logger.debug("Widget auto-reply: empty question, skipping")
            return

        # Call external chat API (microtunchat)
        try:
            resp = requests.post(EXTERNAL_CHAT_API, json={'question': question}, timeout=120)
            data = resp.json() if resp.status_code == 200 else {}
        except Exception as e:
            logger.error(f"Widget auto-reply API request failed: {e}")
            return

        answer = data.get('answer') if isinstance(data, dict) else None
        if not answer:
            logger.info(f"Widget auto-reply: no answer from API for question: {question}")
            return
        
        #TODO: HANDOVER IF BOT CAN NOT ANSWER -> TURN TO USER
        # answer = "Luuvaodbtest"
        # handover = True
        # sent_doc = None
        # if handover:
        #     from models.integration import IntegrationModel
        #     from models.user import UserModel

        #     user_model = UserModel(mongo_client)
        #     users = user_model.find_by_organization_id(organization_id)

        #     integration_model = IntegrationModel(mongo_client)
        #     integration = integration_model.find_by_organization_id('zalo', organization_id)

        #     access_token = integration.get('access_token')

        #     results = []

        #     for user in users:
        #         zalo_user_id = user.get('zalo_user_id')
        #         if not zalo_user_id:
        #             continue  # skip users without Zalo

        #         try:
        #             resp = _send_message_to_zalo(
        #                 access_token,
        #                 zalo_user_id,
        #                 message_text=answer
        #             )
        #             results.append({
        #                 'zalo_user_id': zalo_user_id,
        #                 'success': True,
        #                 'response': resp
        #             })
        #         except Exception as e:
        #             results.append({
        #                 'zalo_user_id': zalo_user_id,
        #                 'success': False,
        #                 'error': str(e)
        #             })
        # else:
            # return {
            #     'success': True,
            #     'sent': len([r for r in results if r['success']]),
            #     'failed': len([r for r in results if not r['success']]),
            #     'results': results
            # }

            # Persist outgoing bot message and update conversation
        try:
            from models.message import MessageModel
            from models.conversation import ConversationModel
            message_model = MessageModel(mongo_client)
            conversation_model = ConversationModel(mongo_client)

            sent_doc = message_model.add_message(
                platform='widget',
                oa_id=oa_id,
                sender_id='widget-bot',
                direction='out',
                text=answer,
                metadata={'auto_reply': True, 'source': 'external_api', 'api_response': data},
                is_read=True,
                conversation_id=conversation_id,
                account_id=None,
                organization_id=organization_id,
            )

            conversation_model.upsert_conversation(
                oa_id=oa_id,
                customer_id=customer_id,
                last_message_text=answer,
                last_message_created_at=datetime.utcnow(),
                direction='out',
                organization_id=organization_id,
            )
        except Exception as e:
            logger.error(f"Widget auto-reply: failed to persist message: {e}")
            return

        # Emit socket events so UI updates in realtime (dashboard + widget)
        try:
            conv_id_legacy = f"widget:{oa_id}:{customer_id.split(':', 1)[1] if ':' in customer_id else customer_id}"
            payload = {
                'platform': 'widget',
                'oa_id': oa_id,
                'sender_id': customer_id,
                'message': answer,
                'message_doc': sent_doc,
                'conv_id': conv_id_legacy,
                'conversation_id': conversation_id,
                'sent_at': datetime.utcnow().isoformat() + 'Z',
                'direction': 'out',
                # 'handover': handover
            }
            # Prefer direct socketio emit if available (no Flask app context needed)
            if socketio:
                org_room = f"organization:{str(organization_id)}"
                try:
                    socketio.emit('new-message', payload, room=org_room)
                except TypeError:
                    socketio.emit('new-message', payload, room=org_room)
            else:
                # Fallback to helper (requires app context)
                _emit_socket('new-message', payload, account_id=None, organization_id=organization_id)
        except Exception as e:
            logger.debug(f"Widget auto-reply: socket emit failed: {e}")
    except Exception as e:
        logger.error(f"Widget auto-reply worker exception: {e}")


@widget_bp.route('/api/widget/lead', methods=['POST'])
@cross_origin(origins='*', supports_credentials=False)
def submit_lead():
    """Accept a lead submission from an embeddable widget and create a conversation.

    Expected JSON body: { name, phone, message }
    Optional: send header 'X-Organization-ID' to scope the conversation to an organization.

    Security: This endpoint currently trusts the provided organization id (header or JSON).
    For production use, require an organization-scoped widget key and validate it.
    """
    try:
        data = request.get_json(silent=True) or {}
        name = data.get('name') or data.get('fullName')
        phone = data.get('phone')
        message = data.get('message') or data.get('text') or ''

        # account_id = _get_account_id_from_request()
        # if not account_id:
        #     return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400
        # # Resolve organization id (header preferred)
        # org_id = get_organization_id_from_request()
        # if not org_id:
        #     # Accept organizationId in body as fallback (note: trusting client-provided value)
        #     org_id = data.get('organizationId')

        # if not org_id:
        #     return jsonify({'success': False, 'message': 'organizationId required in header X-Organization-ID or in request body'}), 400
        
        chatbot_id = get_chatbot_id_from_request()
        if not chatbot_id:
            return jsonify({'success': False, 'message': 'Chatbot ID required in header X-Chatbot-ID'}), 400

        from models.chatbot import ChatbotModel
        from models.customer import CustomerModel

        chatbot_model = ChatbotModel(current_app.mongo_client)
        customer_model = CustomerModel(current_app.mongo_client)

        chatbot = chatbot_model.find_by_chatbot_id(chatbot_id)

        if not chatbot:
            return jsonify({'success': False, 'message': 'Chatbot not found'}), 404
        
        account_id = chatbot.get('accountId')
        org_id = chatbot.get('organizationId')

        if not (name or phone or message):
            return jsonify({'success': False, 'message': 'At least one of name/phone/message is required'}), 400

        # Build a widget-specific customer id
        customer_id = f"widget:{uuid.uuid4().hex}"
        platform_specific_id = customer_id.replace('widget:', '')
        customer_doc = customer_model.upsert_customer(
            platform='widget',
            platform_specific_id=platform_specific_id,
            name=name,
            avatar=None,
            phone=phone
        )

        oa_id = 'widget'  # channel identifier
        sender_profile = {
            'name': name,
            'phone': phone,
            'avatar': None,
        }

        # Persist conversation
        conv_model = ConversationModel(current_app.mongo_client)
        conv = conv_model.upsert_conversation(
            oa_id=oa_id,
            customer_id=customer_id,
            last_message_text=message,
            last_message_created_at=datetime.utcnow(),
            direction='in',
            customer_info=sender_profile,
            increment_unread=True,
            organization_id=org_id,
            account_id=account_id,
            chatbot_id=chatbot_id,
            chatbot_info={
                'name': chatbot.get('name'),
                'avatar': chatbot.get('avatar_url'),
            }
        )

        # Ensure conversation_id is a string for API responses
        conversation_id_str = str(conv.get('_id')) if conv.get('_id') else None

        # Persist message
        msg_model = MessageModel(current_app.mongo_client)
        message_doc = msg_model.add_message(
            platform='widget',
            oa_id=oa_id,
            sender_id=customer_id,
            direction='in',
            text=message,
            metadata={'phone': phone, 'source': 'widget'},
            conversation_id=conversation_id_str,
            organization_id=org_id,
            account_id=account_id,
            sender_profile=sender_profile,
        )

        # Format the conv_id for API use
        conv_id_formatted = f"widget:{oa_id}:{customer_id.replace('widget:', '')}"
        
        # Emit socket events so staff see the new lead
        try:
            socketio = getattr(current_app, 'socketio', None)
            payload = {
                'platform': 'widget',
                'oa_id': oa_id,
                'sender_id': customer_id,
                'message': message,
                'message_doc': message_doc,
                'conv_id': conv_id_formatted,
                'conversation_id': conversation_id_str,
                'sent_at': datetime.utcnow().isoformat() + 'Z',
                'direction': 'in',
                'chatbot_info': {
                    'name': chatbot.get('name'),
                    'avatar': chatbot.get('avatar_url'),
                },
                'customer_info': sender_profile,
            }
            if socketio:
                org_room = f"organization:{str(org_id)}"
                try:
                    socketio.emit('new-message', payload, room=org_room)
                except TypeError:
                    socketio.emit('new-message', payload, room=org_room)

                socketio.emit('update-conversation', {
                    'conversation_id': conversation_id_str,
                    'conv_id': conv_id_formatted,
                    'oa_id': oa_id,
                    'customer_id': customer_id,
                    'last_message': {'text': message, 'created_at': datetime.utcnow().isoformat() + 'Z'},
                    'unread_count': conv.get('unread_count', 0),
                    'customer_info': sender_profile,
                    'platform': 'widget',
                    'bot_reply': conv.get('bot_reply'),
                    'tags': conv.get('tags'),
                }, room=org_room)
        except Exception as e:
            logger.debug(f"Widget socket emit failed: {e}")

        # 6. Auto-reply for widget conversations (bot mode)
        try:
            # The conversation was just created with bot_reply=True, so trigger auto-reply for incoming customer message with text
            if message:
                try:
                    mongo_client = current_app.mongo_client
                    socketio = getattr(current_app, 'socketio', None)
                    t = threading.Thread(
                        target=_auto_reply_worker_widget,
                        args=(mongo_client, oa_id, customer_id, conversation_id_str, message, org_id, socketio),
                        daemon=True
                    )
                    t.start()
                    logger.info(f"Scheduled widget auto-reply worker for new conversation {conversation_id_str}")
                except Exception as e:
                    logger.error(f"Failed to start widget auto-reply worker thread: {e}")
        except Exception:
            # Do not fail the main request if auto-reply scheduling fails
            pass

        return jsonify({'success': True, 'conversation_id': conversation_id_str, 'conv_id': conv_id_formatted, 'message': 'Lead submitted', 'message_doc': message_doc}), 200

    except Exception as e:
        logger.exception(f"Error in submit_lead: {e}")
        return jsonify({'success': False, 'message': 'Server error'}), 500


@widget_bp.route('/api/widget/conversations/<path:conv_id>/messages', methods=['GET'])
@cross_origin(origins='*', supports_credentials=False)
def get_conversation_messages(conv_id):
    """Get messages for a widget conversation.
    
    conv_id format: widget:oa_id:customer_id (e.g., widget:widget:widget:uuid)
    """
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) < 3 or parts[0] != 'widget':
        return jsonify({'success': False, 'message': 'Invalid conversation id format'}), 400
    
    # Extract: widget : oa_id : customer_id (rest after splitting first 2 colons)
    platform, oa_id, sender_id = parts

    try:
        limit = int(request.args.get('limit', 20))
    except Exception:
        limit = 20
    try:
        skip = int(request.args.get('skip', 0))
    except Exception:
        skip = 0
    
    if limit < 0:
        limit = 0
    if skip < 0:
        skip = 0
    if limit > 200:
        limit = 200

    try:
        from models.conversation import ConversationModel
        from models.message import MessageModel
        from models.user import UserModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        
        org_id = user_model.get_user_organization_id(account_id)
        customer_id = f"widget:{sender_id}"

        # Find conversation by customer_id in widget channel
        conversation_doc = conversation_model.find_by_oa_and_customer(
            oa_id, customer_id, organization_id=org_id, account_id=account_id
        )
        conversation_id = conversation_doc.get('_id') if conversation_doc else None
        
        # Ensure conversation_id is a string if it exists
        if conversation_id and not isinstance(conversation_id, str):
            try:
                conversation_id = str(conversation_id)
            except Exception:
                conversation_id = None
        
        if org_id and conversation_id:
            # Primary: Use organization-based query
            msgs = message_model.get_by_organization_and_conversation(
                org_id, conversation_id,
                limit=limit, skip=skip
            )
            logger.info(f"Retrieved {len(msgs)} messages using organization context")
        else:
            # Fallback: Legacy account-based query
            msgs = message_model.get_messages(
                platform, oa_id, sender_id, 
                limit=limit, skip=skip, 
                conversation_id=conversation_id,
                account_id=account_id
            )
            logger.info(f"Retrieved {len(msgs)} messages using legacy query")
        logger.info(f"Retrieved {len(msgs)} messages for conversation {conv_id}")
        
        return jsonify({'success': True, 'data': msgs, 'conversation': conversation_doc}), 200
    
    except Exception as e:
        logger.error(f"Failed to fetch widget messages: {e}")
        return jsonify({'success': False, 'message': 'Internal error fetching messages'}), 500


@widget_bp.route('/api/widget/conversations/<path:conv_id>/mark-read', methods=['POST'])
@cross_origin(origins='*', supports_credentials=False)
def mark_conversation_read(conv_id):
    """Mark widget conversation as read.
    
    conv_id format: widget:oa_id:customer_id
    """
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    if len(parts) < 3 or parts[0] != 'widget':
        return jsonify({'success': False, 'message': 'Invalid conversation id format'}), 400
    
    platform, oa_id, sender_id = parts

    try:
        from models.conversation import ConversationModel
        from models.message import MessageModel
        from models.user import UserModel
        
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)
        
        customer_id = f"widget:{sender_id}"
        org_id = user_model.get_user_organization_id(account_id)
        
        # Find conversation
        conversation_doc = conversation_model.find_by_oa_and_customer(
            oa_id, customer_id, organization_id=org_id, account_id=account_id
        )
        conversation_id = conversation_doc.get('_id') if conversation_doc else None
        
        if conversation_id and not isinstance(conversation_id, str):
            try:
                conversation_id = str(conversation_id)
            except Exception:
                conversation_id = None
        
        # Mark conversation as read
        if conversation_doc:
            conversation_model.mark_read(oa_id, customer_id, account_id=account_id, organization_id=org_id)
        
        # Mark messages as read using organization context
        if org_id and conversation_id:
            modified = message_model.mark_as_read_by_organization(org_id, conversation_id)
        else:
            modified = message_model.mark_read(platform, oa_id, sender_id, conversation_id=conversation_id)
        
        logger.info(f"Marked {modified} messages as read for widget conversation {conv_id}")
        return jsonify({'success': True, 'updated': modified}), 200
    
    except Exception as e:
        logger.error(f"Failed to mark widget conversation read: {e}")
        return jsonify({'success': False, 'message': 'Internal error'}), 500


@widget_bp.route('/api/widget/conversations/<path:conv_id>/messages', methods=['POST'])
@cross_origin(origins='*', supports_credentials=False)
def send_conversation_message(conv_id):
    """
    Send a message to a widget conversation.
    Authorizes based on Organization ID without checking an integration record.
    """
    # account_id may be present for staff-originated messages; for widget/customer messages
    # there may be no account_id. We support both flows.
    account_id = _get_account_id_from_request()

    parts = conv_id.split(':')
    # Expected format: widget:oa_id:customer_uuid
    if len(parts) < 3 or parts[0] != 'widget':
        return jsonify({'success': False, 'message': 'Invalid conversation id format'}), 400
    
    platform, oa_id, sender_id = parts
    data = request.get_json() or {}
    text = data.get('text')
    image = data.get('image')

    if not text and not image:
        return jsonify({'success': False, 'message': 'text or image is required'}), 400

    try:
        from models.user import UserModel
        from models.conversation import ConversationModel
        from models.message import MessageModel
        from models.customer import CustomerModel

        user_model = UserModel(current_app.mongo_client)
        conversation_model = ConversationModel(current_app.mongo_client)
        message_model = MessageModel(current_app.mongo_client)
        customer_model = CustomerModel(current_app.mongo_client)
        
        # Determine organization id: prefer auth-based lookup for staff, otherwise header/body
        org_id = None
        if account_id:
            org_id = user_model.get_user_organization_id(account_id)
            if not org_id:
                return jsonify({'success': False, 'message': 'User has no organization'}), 403

        # Allow organization to be passed via header or body for widget-originated messages
        if not org_id:
            org_id = get_organization_id_from_request() or data.get('organizationId')

        customer_id = f"widget:{sender_id}"
        customer_data = customer_model.find_by_id(sender_id)
        sender_profile = {
            'name': customer_data.get('name') if customer_data else None,
            'avatar': customer_data.get('avatar') if customer_data else None,
        }
        # Two flows: staff-originated (account_id present) OR widget/customer-originated (no account_id)
        if account_id:
            # STAFF flow: staff is sending a message TO the widget/customer
            # 2. Find Conversation (Filtered by Org for Security)
            conversation_doc = conversation_model.find_by_oa_and_customer(
                oa_id, customer_id, organization_id=org_id
            )
            if not conversation_doc:
                # If it's a new conversation from staff side, we upsert it
                conversation_doc = conversation_model.upsert_conversation(
                    oa_id=oa_id,
                    customer_id=customer_id,
                    organization_id=org_id,
                    account_id=account_id # Tracking who initiated
                )

            conversation_id = str(conversation_doc.get('_id'))

            # 3. Add Message (Outgoing from Staff)
            handler_user = user_model.find_by_account_id(account_id)
            staff_name = handler_user.get('name') or handler_user.get('username') or "Staff"
            metadata = {'source': 'staff', 'type': 'widget', 'staff_name': staff_name}
            if image: metadata['image'] = image

            message_doc = message_model.add_message(
                platform='widget',
                oa_id=oa_id,
                sender_id=account_id,  # Staff member sending this message
                direction='out',
                text=text,
                metadata=metadata,
                is_read=True,
                conversation_id=conversation_id,
                organization_id=org_id,
                account_id=account_id,
                sender_profile=sender_profile,
            )
        else:
            # WIDGET / CUSTOMER flow: customer is sending message to staff
            # 2. Find or create conversation scoped to organization
            conversation_doc = conversation_model.find_by_oa_and_customer(
                oa_id, customer_id, organization_id=org_id
            )
            if not conversation_doc:
                conversation_doc = conversation_model.upsert_conversation(
                    oa_id=oa_id,
                    customer_id=customer_id,
                    organization_id=org_id,
                )
            conversation_id = str(conversation_doc.get('_id'))

            # 3. Add Message (Incoming from customer)
            metadata = {'source': 'widget', 'type': 'widget'}
            if image:
                metadata['image'] = image
            message_doc = message_model.add_message(
                platform='widget',
                oa_id=oa_id,
                sender_id=customer_id,
                direction='in',
                text=text,
                metadata=metadata,
                is_read=False,
                conversation_id=conversation_id,
                organization_id=org_id,
                account_id=None,
                sender_profile=sender_profile,
            )
        
        # 4. Update Conversation State (direction depends on sender)
        msg_direction = 'out' if account_id else 'in'
        conversation_model.upsert_conversation(
            oa_id=oa_id,
            customer_id=customer_id,
            last_message_text=text if text else "Tệp đính kèm",
            last_message_created_at=datetime.utcnow(),
            direction=msg_direction,
            organization_id=org_id,
            increment_unread=(msg_direction == 'in')
        )
        
        # 5. Socket Emission
        try:
            # The room name should follow your app's convention for organization-wide updates
            org_room = f"organization:{str(org_id)}"
            
            payload = {
                'platform': 'widget',
                'oa_id': oa_id,
                'sender_id': sender_id,
                'message': text if text else "Tệp đính kèm",
                'message_doc': message_doc,
                'conv_id': conv_id,
                'conversation_id': conversation_id,
                'direction': msg_direction,
                'sent_at': datetime.utcnow().isoformat() + 'Z',
                'sender_profile': {'name': staff_name if account_id else None, 'avatar': None},
            }
            
            _emit_socket('new-message', payload, account_id=account_id, organization_id=org_id)
            # also emit update-conversation so sidebar/tags stay up-to-date
            try:
                refreshed_conv = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=org_id)
                _emit_socket('update-conversation', {
                    'conversation_id': conversation_id,
                    'conv_id': conv_id,
                    'oa_id': oa_id,
                    'customer_id': customer_id,
                    'last_message': {'text': text if text else "Tệp đính kèm", 'created_at': datetime.utcnow().isoformat() + 'Z'},
                    'unread_count': conversation_doc.get('unread_count', 0) if conversation_doc else 0,
                    'customer_info': sender_profile,
                    'platform': 'widget',
                    'tags': refreshed_conv.get('tags') if refreshed_conv else None,
                }, account_id=account_id, organization_id=org_id)
            except Exception:
                pass
            
            # Atomic claim: first person to reply handles the chat (staff side only)
            if account_id:
                claimed = conversation_model.set_handler_if_unset(conversation_id, account_id, staff_name)
                if claimed:
                    _emit_socket('conversation-locked', {
                        'conv_id': conv_id,
                        'conversation_id': conversation_id,
                        'handler': claimed.get('current_handler')
                    }, account_id=account_id, organization_id=org_id)

                    # Also emit update-conversation with tags so UIs update in real-time
                    try:
                        refreshed_conv = conversation_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=org_id)
                        if refreshed_conv:
                            _emit_socket('update-conversation', {
                                'conversation_id': conversation_id,
                                'conv_id': conv_id,
                                'oa_id': oa_id,
                                'customer_id': customer_id,
                                'tags': refreshed_conv.get('tags'),
                                'platform': 'widget',
                            }, account_id=account_id, organization_id=org_id)
                    except Exception:
                        pass

        except Exception as se:
            logger.debug(f"Widget socket emit failed: {se}")

        # 6. Auto-reply for widget conversations (bot mode)
        try:
            # Refresh conversation doc to ensure we see latest bot_reply flag
            try:
                latest_conv = conversation_model.find_by_oa_and_customer(
                    oa_id, customer_id, organization_id=org_id
                ) or conversation_doc
            except Exception:
                latest_conv = conversation_doc

            bot_flag = latest_conv.get('bot_reply') if latest_conv else None
            if bot_flag is None and latest_conv:
                bot_flag = latest_conv.get('bot-reply') if 'bot-reply' in latest_conv else None

            # Only trigger auto-reply for incoming customer messages with text
            if msg_direction == 'in' and bot_flag and text:
                try:
                    mongo_client = current_app.mongo_client
                    socketio = getattr(current_app, 'socketio', None)
                    t = threading.Thread(
                        target=_auto_reply_worker_widget,
                        args=(mongo_client, oa_id, customer_id, conversation_id, text, org_id, socketio),
                        daemon=True
                    )
                    t.start()
                    logger.info(f"Scheduled widget auto-reply worker for conversation {conversation_id}")
                except Exception as e:
                    logger.error(f"Failed to start widget auto-reply worker thread: {e}")
        except Exception:
            # Do not fail the main request if auto-reply scheduling fails
            pass
        
        return jsonify({'success': True, 'message_doc': message_doc}), 200
    
    except Exception as e:
        logger.error(f"Failed to send widget message: {e}", exc_info=True)
        return jsonify({'success': False, 'message': 'Internal error'}), 500


@widget_bp.route('/api/widget/conversations/<path:conv_id>/bot-reply', methods=['POST'])
@cross_origin(origins='*', supports_credentials=False)
def set_widget_conversation_bot_reply(conv_id):
    """Toggle auto-reply for a widget conversation. Expects JSON: {"enabled": true/false}
    
    This mirrors the Facebook bot-reply endpoint but uses the widget routing and
    organization/account isolation model.
    """
    account_id = _get_account_id_from_request()
    if not account_id:
        return jsonify({'success': False, 'message': 'Account ID required in header X-Account-Id or query'}), 400

    parts = conv_id.split(':')
    # Expected format: widget:oa_id:customer_uuid
    if len(parts) < 3 or parts[0] != 'widget':
        return jsonify({'success': False, 'message': 'Invalid conversation id'}), 400

    platform, oa_id, sender_id = parts
    if platform != 'widget':
        return jsonify({'success': False, 'message': 'Unsupported platform'}), 400

    data = request.get_json() or {}
    enabled = data.get('enabled')
    # normalize truthy values
    enabled_bool = True if enabled in [True, 'true', 'True', 1, '1'] else False

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel

        conversation_model = ConversationModel(current_app.mongo_client)
        user_model = UserModel(current_app.mongo_client)

        # Use organization for authorization / isolation
        user_org_id = user_model.get_user_organization_id(account_id)
        if not user_org_id:
            return jsonify({'success': False, 'message': 'User has no organization'}), 403

        customer_id = f"widget:{sender_id}"
        conv = conversation_model.find_by_oa_and_customer(
            oa_id,
            customer_id,
            organization_id=user_org_id,
            account_id=account_id,
        )
        if not conv:
            return jsonify({'success': False, 'message': 'Conversation not found'}), 404

        # Persist bot_reply flag (store under conversation id)
        updated = conversation_model.set_bot_reply_by_id(
            conv.get('_id'),
            enabled_bool,
            account_id=account_id,
            organization_id=user_org_id,
        )

        # Emit update so other clients (account owner and org members) get realtime state
        try:
            # Refresh conversation to ensure we get latest tags
            refreshed_conv = conversation_model.find_by_oa_and_customer(
                oa_id, customer_id, organization_id=user_org_id, account_id=account_id
            ) or updated
            conv_id_legacy = conv_id
            org_fallback = user_org_id or conv.get('organizationId')
            _emit_socket(
                'update-conversation',
                {
                    'conversation_id': conv.get('_id'),
                    'conv_id': conv_id_legacy,
                    'oa_id': oa_id,
                    'customer_id': customer_id,
                    'bot_reply': updated.get('bot_reply') if updated and 'bot_reply' in updated else enabled_bool,
                    'tags': refreshed_conv.get('tags') if refreshed_conv else None,
                },
                account_id=account_id,
                organization_id=org_fallback,
            )
        except Exception as e:
            logger.debug(f"Failed to emit widget bot-reply update: {e}")

        return jsonify({'success': True, 'data': updated}), 200
    except Exception as e:
        logger.error(f"Failed to set widget bot-reply for conversation {conv_id}: {e}")
        return jsonify({'success': False, 'message': 'Internal error setting bot reply'}), 500