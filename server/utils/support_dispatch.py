import logging

logger = logging.getLogger(__name__)


def dispatch_support_needed(mongo_client, organization_id, conv_id, customer_name=None, content=None, platform=None, socketio=None):
    """Best-effort dispatch to available staff via Zalo message + optional socket event.

    This implements TEST.md "Dispatching" in a testable way:
    - scans staff users in the organization
    - skips staff that are marked busy in Redis
    - sends a Zalo message instructing `/accept <conv_id>`
    """
    if not mongo_client or not organization_id or not conv_id:
        return {'success': False, 'sent': 0, 'skipped_busy': 0, 'skipped_no_zalo': 0, 'skipped_no_staff': 0}

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

        users = user_model.find_by_organization_id(organization_id) or []
        staff_users = [u for u in users if u.get('role') == 'staff' and bool(u.get('is_active', True))]
        if not staff_users:
            return {'success': True, 'sent': 0, 'skipped_busy': 0, 'skipped_no_zalo': 0, 'skipped_no_staff': 1}

        sent = 0
        skipped_busy = 0
        skipped_no_zalo = 0

        title = "🔔 KHÁCH HÀNG CẦN HỖ TRỢ"
        name_line = f"Khách hàng: {customer_name or 'Khách hàng'}"
        content_line = f"Nội dung: \"{(content or '').strip()[:200]}\""
        platform_line = f"Nền tảng: {platform or 'unknown'}"
        # Staff can just type /accept to take the oldest pending.
        # We still include conv_id as reference for debugging/traceability.
        accept_line = "Gõ: /accept"
        # ref_line = f"Mã: {conv_id}"
        text = "\n".join([title, "", name_line, content_line, platform_line, "", accept_line])

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
                # If no access_token, _send_message_to_zalo will mock-send when token is missing/mock
                _send_message_to_zalo(access_token, str(staff_zalo_user_id), message_text=text)
                sent += 1
            except Exception as e:
                logger.warning(f"Failed to notify staff {staff_account_id} zalo_user_id={staff_zalo_user_id}: {e}")

            # Optional: also emit a socket event to the staff's account room (frontend may consume later)
            try:
                if socketio and staff_account_id:
                    socketio.emit('support-needed', {
                        'conv_id': conv_id,
                        'platform': platform,
                        'customer_name': customer_name,
                        'content': content,
                        'organization_id': str(organization_id),
                    }, room=f"account:{str(staff_account_id)}")
            except Exception:
                pass

        return {
            'success': True,
            'sent': sent,
            'skipped_busy': skipped_busy,
            'skipped_no_zalo': skipped_no_zalo,
            'skipped_no_staff': 0
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
        from utils.support_workflow import get_key, _key_pending
        from routes.zalo import _send_message_to_zalo

        user_model = UserModel(mongo_client)

        # Get staff user's Zalo ID
        staff_user = user_model.find_by_account_id(staff_account_id)
        if not staff_user or not staff_user.get('zalo_user_id'):
            return {'success': False, 'reason': 'staff_no_zalo'}

        staff_zalo_id = staff_user.get('zalo_user_id')

        # Fetch pending requests from Redis
        pending_key = _key_pending(organization_id)
        raw_pending = get_key(pending_key)
        pending_list = []
        if raw_pending:
            try:
                import json
                pending_list = json.loads(raw_pending) if isinstance(raw_pending, str) else raw_pending
                if not isinstance(pending_list, list):
                    pending_list = []
            except Exception:
                pending_list = []

        if not pending_list:
            # No pending requests
            msg = "Không còn yêu cầu hỗ trợ nào đang chờ."
            _send_message_to_zalo(access_token, str(staff_zalo_id), message_text=msg)
            logger.debug(f"No pending requests for {staff_account_id}")
            return {'success': True, 'pending_count': 0}

        # Build pending message
        title = "📋 DANH SÁCH YÊU CẦU CHỜ HỖ TRỢ"
        lines = [title, ""]
        for i, conv_id in enumerate(pending_list[:10], 1):  # Show max 10
            lines.append(f"{i}. Mã: {conv_id}")
        
        if len(pending_list) > 10:
            lines.append(f"\n... và {len(pending_list) - 10} yêu cầu khác")
        
        lines.extend(["", "Gõ: /accept"])
        msg = "\n".join(lines)

        # Send to staff's Zalo personal account
        try:
            _send_message_to_zalo(access_token, str(staff_zalo_id), message_text=msg)
            logger.debug(f"Sent pending list to staff {staff_zalo_id}: {len(pending_list)} items")
            return {'success': True, 'pending_count': len(pending_list)}
        except Exception as e:
            logger.warning(f"Failed to send pending list to staff {staff_zalo_id}: {e}")
            return {'success': False, 'reason': f'send_failed: {str(e)}'}

    except Exception as e:
        logger.error(f"send_pending_list_to_staff error: {e}", exc_info=True)
        return {'success': False, 'reason': f'error: {str(e)}'}

