from flask import request


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
