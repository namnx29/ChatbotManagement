from flask import request
import logging

logger = logging.getLogger(__name__)

def get_account_id_from_request():
    """Extract account id from flask login or request headers/params/json.

    This consolidates repeated logic across route modules.
    """
    try:
        from flask_login import current_user
        if current_user and getattr(current_user, 'is_authenticated', False):
            return current_user.get_id()
    except Exception:
        pass
    account_id = request.headers.get('X-Account-Id') or request.args.get('accountId') or (request.get_json(silent=True) or {}).get('accountId')
    return account_id


def get_organization_id_from_request(user_model=None):
    """Extract organizationId from current user
    
    Args:
        user_model: UserModel instance to lookup organizationId from accountId
    
    Returns: organization_id (str) or None
    
    Flow:
    1. Try direct organizationId header (for testing/internal use)
    2. Get accountId from request
    3. Lookup organizationId via user_model if available
    """
    # Try direct organizationId header (internal use)
    organization_id = request.headers.get('X-Organization-ID')
    if organization_id:
        return organization_id
    
    # Get accountId and lookup organizationId
    if user_model:
        account_id = get_account_id_from_request()
        if account_id:
            organization_id = user_model.get_user_organization_id(account_id)
            if organization_id:
                return organization_id
    
    return None

def get_chatbot_id_from_request():
    """Extract account id from flask login or request headers/params/json.

    This consolidates repeated logic across route modules.
    """
    chatbot_id = request.headers.get('X-Chatbot-ID')
    if chatbot_id:
        return chatbot_id

def extract_isolation_context(user_model=None):
    """Extract both accountId and organizationId for isolation queries
    
    Args:
        user_model: UserModel instance to lookup organizationId from accountId
    
    Returns: dict with 'accountId' and 'organizationId' keys
    
    This is the primary helper for route functions to get isolation context
    Use organizationId as primary key, fall back to accountId if needed
    """
    context = {
        'accountId': get_account_id_from_request(),
        'organizationId': get_organization_id_from_request(user_model)
    }
    
    logger.debug(f"Isolation context: accountId={context['accountId']}, organizationId={context['organizationId']}")
    
    return context