import logging

logger = logging.getLogger(__name__)


def _get_conversation_for_pending(mongo_client, organization_id, conv_id):
    """Resolve a Conversation doc from a pending conv_id string."""
    from models.conversation import ConversationModel

    conv_model = ConversationModel(mongo_client)

    parts = str(conv_id).split(':')
    if len(parts) < 3:
        return None

    platform = parts[0].strip().lower()
    oa_id = parts[1]
    customer_id_full = ':'.join(parts[2:])  # rejoin in case customer_id also has ':'
    customer_id = f"{platform}:{customer_id_full}"

    try:
        return conv_model.find_by_oa_and_customer(oa_id, customer_id, organization_id=organization_id, account_id=None)
    except TypeError:
        # Backward compat if signature differs in older code paths
        return conv_model.find_by_oa_and_customer(oa_id, customer_id)


def cleanup_pending_support_list(mongo_client, organization_id):
    """Remove stale/handled items from the org pending list (best-effort)."""
    if not mongo_client or not organization_id:
        return []
    try:
        from utils.support_workflow import get_pending_support_list, set_pending_support_list

        items = get_pending_support_list(organization_id) or []
        if not items:
            return []

        cleaned = []
        seen = set()

        for raw in items:
            conv_id = str(raw)
            if conv_id in seen:
                continue
            seen.add(conv_id)

            conv = _get_conversation_for_pending(mongo_client, organization_id, conv_id)
            if not conv:
                continue

            # still pending if: no handler AND bot is disabled (or explicitly bot-failed)
            handler = conv.get('current_handler')
            if handler:
                continue

            tags = (conv.get('tags') or '').strip().lower()
            bot_flag = conv.get('bot_reply') if 'bot_reply' in conv else conv.get('bot-reply')
            if tags == 'bot-failed' or (bot_flag is False):
                cleaned.append(conv_id)

        # Keep order, limit, and persist
        cleaned = cleaned[:1000]
        set_pending_support_list(organization_id, cleaned)
        return cleaned
    except Exception as e:
        logger.debug(f"cleanup_pending_support_list failed: {e}")
        return []


def _build_pending_message(mongo_client, organization_id, conv_id, index):
    """Build a formatted message for a single pending request with platform, customer name, and last message.
    Returns a formatted string or None if conversation not found.
    """
    try:
        # Parse conv_id format: "platform:oa_id:customer_id"
        parts = str(conv_id).split(':')
        if len(parts) < 3:
            return None
        platform = parts[0].strip().lower()
        
        # Try to find the conversation by oa_id and customer_id
        oa_id = parts[1]
        customer_id_full = ':'.join(parts[2:])  # rejoin in case customer_id also has ':'
        customer_id = f"{platform}:{customer_id_full}"

        conv = _get_conversation_for_pending(mongo_client, organization_id, conv_id)
        if not conv:
            return None
        
        # Extract relevant info
        customer_name = (conv.get('customer_info') or {}).get('name') or 'Khách hàng'
        last_message = conv.get('last_message_text') or None
        
        # If last_message_text is empty, try to fetch the latest message from messages collection
        if not last_message:
            try:
                from models.message import MessageModel
                msg_model = MessageModel(mongo_client)
                # Get the latest CUSTOMER message (direction='in') from the conversation
                # Get multiple messages and filter for customer messages
                recent_msgs = msg_model.get_messages(
                    platform, oa_id, customer_id_full, limit=10, skip=0,
                    conversation_id=conv.get('_id'), account_id=None
                )
                if recent_msgs and len(recent_msgs) > 0:
                    # Find the latest customer message (direction='in')
                    for msg in recent_msgs:
                        if msg.get('direction') == 'in':  # Only customer messages
                            last_message = msg.get('text') or 'Không có tin nhắn'
                            break
                    # If no customer message found, fall back to any message
                    if not last_message:
                        last_message = recent_msgs[0].get('text') or 'Không có tin nhắn'
            except Exception:
                pass
        
        last_message = (last_message or 'Không có tin nhắn')[:150]
        
        # Map platform code to display name
        platform_display = {
            'zalo': 'Zalo',
            'facebook': 'Facebook',
            'instagram': 'Instagram',
            'widget': 'Website'
        }.get(platform, platform.capitalize())
        
        # Build formatted message
        title = "🔔 KHÁCH HÀNG CẦN HỖ TRỢ"
        name_line = f"Khách hàng: {customer_name}"
        content_line = f"Nội dung: \"{last_message}\""
        platform_line = f"Nền tảng: {platform_display}"
        accept_line = f"Gõ: /accept{index}"
        
        return "\n".join([title, "", name_line, content_line, platform_line, "", accept_line])
    except Exception as e:
        logger.debug(f"Failed to build pending message for {conv_id}: {e}")
        return None


def dispatch_support_needed(mongo_client, organization_id, conv_id, customer_name=None, content=None, platform=None, socketio=None):
    """Dispatch to available staff with pending list support.
    
    Fetches all pending requests and sends formatted messages with platform, customer name,
    and last message, allowing staff to choose via /accept<number>.
    """
    if not mongo_client or not organization_id or not conv_id:
        return {'success': False, 'sent': 0, 'skipped_busy': 0, 'skipped_no_zalo': 0, 'skipped_no_staff': 0}

    # Fallback: get socketio from Flask app when not passed (e.g. called from request context)
    if socketio is None:
        try:
            from flask import current_app
            socketio = getattr(current_app, 'socketio', None)
        except Exception:
            pass

    try:
        from models.user import UserModel
        from models.integration import IntegrationModel
        from utils.support_workflow import is_staff_busy
        from routes.zalo import _send_message_to_zalo

        user_model = UserModel(mongo_client)
        integration_model = IntegrationModel(mongo_client)

        # Use any active Zalo integration token from this org to send staff notifications
        zalo_integration = integration_model.find_by_organization_id('zalo', organization_id)
        access_token = (zalo_integration or {}).get('access_token')

        # Fetch + clean pending list (avoid stale items after web handled)
        pending_list = cleanup_pending_support_list(mongo_client, organization_id)[:10]
        pending_count = len(pending_list)

        sent = 0
        skipped_busy = 0
        skipped_no_zalo = 0

        # Web notify: broadcast to org room so all staff/admin see it
        try:
            if socketio and organization_id:
                msg_name = customer_name or "Khách hàng"
                socketio.emit('support-needed', {
                    'conv_id': conv_id,
                    'platform': platform,
                    'customer_name': customer_name,
                    'content': content,
                    'pending_count': pending_count,
                    'organization_id': str(organization_id),
                    'text': f"Khách hàng {msg_name} cần hỗ trợ",
                }, room=f"organization:{str(organization_id)}")
        except Exception:
            pass

        users = user_model.find_by_organization_id(organization_id) or []
        staff_users = [u for u in users if u.get('role') == 'staff' and bool(u.get('is_active', True))]
        if not staff_users:
            return {'success': True, 'sent': 0, 'skipped_busy': 0, 'skipped_no_zalo': 0, 'skipped_no_staff': 1, 'pending_count': pending_count}

        for su in staff_users:
            staff_account_id = su.get('accountId')
            if staff_account_id and is_staff_busy(str(organization_id), str(staff_account_id)):
                skipped_busy += 1
                continue

            staff_zalo_user_id = su.get('zalo_user_id')
            if not staff_zalo_user_id:
                skipped_no_zalo += 1
                continue

            try:
                # Send formatted messages for each pending item
                for idx, pending_conv_id in enumerate(pending_list, 1):
                    msg = _build_pending_message(mongo_client, organization_id, pending_conv_id, idx)
                    if msg:
                        _send_message_to_zalo(access_token, str(staff_zalo_user_id), message_text=msg)
                
                if pending_count > 0:
                    sent += 1
            except Exception as e:
                logger.warning(f"Failed to notify staff {staff_account_id} zalo_user_id={staff_zalo_user_id}: {e}")

            # Optional: also emit a socket event to the staff's account room
            try:
                if socketio and staff_account_id:
                    socketio.emit('support-needed', {
                        'conv_id': conv_id,
                        'platform': platform,
                        'customer_name': customer_name,
                        'content': content,
                        'pending_count': pending_count,
                        'organization_id': str(organization_id),
                        'text': f"Khách hàng {(customer_name or 'Khách hàng')} cần hỗ trợ",
                    }, room=f"account:{str(staff_account_id)}")
            except Exception:
                pass

        return {
            'success': True,
            'sent': sent,
            'skipped_busy': skipped_busy,
            'skipped_no_zalo': skipped_no_zalo,
            'skipped_no_staff': 0,
            'pending_count': pending_count
        }
    except Exception as e:
        logger.error(f"dispatch_support_needed error: {e}", exc_info=True)
        return {'success': False, 'sent': 0, 'skipped_busy': 0, 'skipped_no_zalo': 0, 'skipped_no_staff': 0}


def forward_customer_message_to_staff(mongo_client, conversation_id, message_text, oa_id):
    """
    If a conversation has an active staff handler, forward incoming customer message to them.
    Called when a customer message arrives for a conversation with a staff member assigned.
    """
    if not mongo_client or not conversation_id or not message_text:
        logger.info(f"forward_customer_message_to_staff invoked: conv_id={conversation_id}, msg_len={len(message_text) if message_text else 0}")
        return {'success': False, 'reason': 'missing_args'}

    try:
        from models.conversation import ConversationModel
        from models.user import UserModel
        from models.integration import IntegrationModel
        from routes.zalo import _send_message_to_zalo
        from bson.objectid import ObjectId

        conv_model = ConversationModel(mongo_client)
        user_model = UserModel(mongo_client)
        integration_model = IntegrationModel(mongo_client)

        # Fetch conversation to check for active handler
        # Handle both ObjectId and string conversation_id
        try:
            conv_obj_id = ObjectId(conversation_id) if isinstance(conversation_id, str) else conversation_id
        except Exception:
            conv_obj_id = conversation_id
        
        conv_doc = conv_model.collection.find_one({'_id': conv_obj_id})
        if not conv_doc:
            logger.info(f"forward_customer_message_to_staff: conversation not found - conv_id={conversation_id}")
            return {'success': False, 'reason': 'conversation_not_found'}

        handler = conv_doc.get('current_handler')
        if not handler:
            logger.info(f"forward_customer_message_to_staff: no handler for conv {conversation_id}")
            return {'success': False, 'reason': 'no_active_handler'}

        # Try to get staff from accountId OR from stored staff_zalo_id
        staff_zalo_id = handler.get('staff_zalo_id')
        
        if handler.get('accountId'):
            # Find staff user by accountId
            staff_user = user_model.find_by_account_id(handler.get('accountId'))
            if not staff_user:
                logger.info(f"forward_customer_message_to_staff: staff user not found for account {handler.get('accountId')}")
                return {'success': False, 'reason': 'staff_user_not_found'}

            staff_zalo_id = staff_user.get('zalo_user_id')
            if not staff_zalo_id:
                logger.info(f"forward_customer_message_to_staff: staff {handler.get('accountId')} has no zalo_user_id")
                return {'success': False, 'reason': 'staff_no_zalo'}
        elif not staff_zalo_id:
            logger.info(f"forward_customer_message_to_staff: no accountId and no stored staff_zalo_id in handler")
            return {'success': False, 'reason': 'no_way_to_reach_staff'}

        # Get access token from Zalo integration
        org_id = conv_doc.get('organizationId')
        # First try to locate an integration by the provided oa_id (works for Zalo conversations)
        zalo_integration = integration_model.find_by_platform_and_oa('zalo', oa_id)
        if not zalo_integration:
            # Try fallback meta.profile.oa_id lookup
            raw = integration_model.collection.find_one({'platform': 'zalo', 'meta.profile.oa_id': oa_id})
            if raw:
                zalo_integration = integration_model._serialize(raw)
        # If still not found (e.g. widget conversations with oa_id="widget"),
        # fall back to *any* active Zalo integration in the organization.
        if not zalo_integration and org_id:
            zalo_integration = integration_model.find_by_organization_id('zalo', org_id)
            if zalo_integration:
                logger.info(f"Using org-level zalo integration for forwarding (org {org_id})")
        if not zalo_integration:
            return {'success': False, 'reason': 'zalo_integration_not_found'}

        access_token = zalo_integration.get('access_token')
        if not access_token:
            return {'success': False, 'reason': 'no_access_token'}

        # Send the customer message to staff's personal Zalo
        try:
            customer_name = (conv_doc.get('customer_info') or {}).get('name') or 'Khách hàng'
            message_to_staff = f"[{customer_name}]: {message_text}"
            logger.debug(f"Forwarding to staff {staff_zalo_id}: {message_to_staff[:100]}")
            _send_message_to_zalo(access_token, str(staff_zalo_id), message_text=message_to_staff)
            logger.info(f"Successfully forwarded customer message to staff {staff_zalo_id}")
            return {'success': True, 'staff_zalo_id': staff_zalo_id}
        except Exception as e:
            logger.error(f"Failed to forward message to staff {staff_zalo_id}: {e}", exc_info=True)
            return {'success': False, 'reason': f'send_failed: {str(e)}'}

    except Exception as e:
        logger.error(f"forward_customer_message_to_staff error: {e}", exc_info=True)
        return {'success': False, 'reason': f'error: {str(e)}'}


def send_pending_list_to_staff(mongo_client, staff_account_id, organization_id, access_token):
    """
    When a staff member finishes support (/chatbot), show them remaining pending requests.
    """
    if not mongo_client or not staff_account_id or not organization_id:
        return {'success': False, 'reason': 'missing_args'}

    try:
        from models.user import UserModel
        from routes.zalo import _send_message_to_zalo

        user_model = UserModel(mongo_client)

        # Get staff user's Zalo ID
        staff_user = user_model.find_by_account_id(staff_account_id)
        if not staff_user or not staff_user.get('zalo_user_id'):
            return {'success': False, 'reason': 'staff_no_zalo'}

        staff_zalo_id = staff_user.get('zalo_user_id')

        # Fetch + clean pending list (avoid stale items after web handled)
        pending_list = cleanup_pending_support_list(mongo_client, organization_id)

        if not pending_list:
            # No pending requests
            msg = "Không còn yêu cầu hỗ trợ nào đang chờ."
            _send_message_to_zalo(access_token, str(staff_zalo_id), message_text=msg)
            logger.debug(f"No pending requests for {staff_account_id}")
            return {'success': True, 'pending_count': 0}

        # Send formatted messages for each pending item (max 10)
        try:
            for idx, conv_id in enumerate(pending_list[:10], 1):
                msg = _build_pending_message(mongo_client, organization_id, conv_id, idx)
                if msg:
                    _send_message_to_zalo(access_token, str(staff_zalo_id), message_text=msg)
            
            if len(pending_list) > 10:
                more_msg = f"... và {len(pending_list) - 10} yêu cầu khác"
                _send_message_to_zalo(access_token, str(staff_zalo_id), message_text=more_msg)
            
            logger.debug(f"Sent pending list to staff {staff_zalo_id}: {len(pending_list)} items")
            return {'success': True, 'pending_count': len(pending_list)}
        except Exception as e:
            logger.warning(f"Failed to send pending list to staff {staff_zalo_id}: {e}")
            return {'success': False, 'reason': f'send_failed: {str(e)}'}

    except Exception as e:
        logger.error(f"send_pending_list_to_staff error: {e}", exc_info=True)
        return {'success': False, 'reason': f'error: {str(e)}'}

