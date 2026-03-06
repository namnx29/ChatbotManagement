import json
import logging
from datetime import datetime
from utils.redis_client import set_key, get_key, del_key

logger = logging.getLogger(__name__)

# Redis keys (string values)
# - staff binding: staff_zalo_user_id -> binding payload
# - busy: organization + staff account -> active conv_id
# - pending queue: organization -> JSON list of conv_id

DEFAULT_BINDING_TTL_SECONDS = 60 * 60 * 6  # 6 hours
DEFAULT_BUSY_TTL_SECONDS = 60 * 60 * 6     # 6 hours
DEFAULT_PENDING_TTL_SECONDS = 60 * 60 * 12 # 12 hours


def _key_staff_binding(staff_zalo_user_id: str) -> str:
    return f"support:binding:staff_zalo:{staff_zalo_user_id}"


def _key_staff_busy(organization_id: str, staff_account_id: str) -> str:
    return f"support:busy:{organization_id}:{staff_account_id}"


def _key_pending(organization_id: str) -> str:
    return f"support:pending:{organization_id}"


def get_staff_binding(staff_zalo_user_id: str):
    raw = get_key(_key_staff_binding(staff_zalo_user_id))
    if not raw:
        return None
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None


def set_staff_binding(staff_zalo_user_id: str, binding: dict, ex: int = DEFAULT_BINDING_TTL_SECONDS):
    try:
        payload = dict(binding or {})
        payload.setdefault("updated_at", datetime.utcnow().isoformat() + "Z")
        set_key(_key_staff_binding(staff_zalo_user_id), json.dumps(payload), ex=ex)
        return payload
    except Exception as e:
        logger.error(f"Failed to set staff binding: {e}")
        return None


def clear_staff_binding(staff_zalo_user_id: str):
    try:
        del_key(_key_staff_binding(staff_zalo_user_id))
        return True
    except Exception:
        return False


def is_staff_busy(organization_id: str, staff_account_id: str) -> bool:
    try:
        return bool(get_key(_key_staff_busy(organization_id, staff_account_id)))
    except Exception:
        return False


def get_staff_busy_conv_id(organization_id: str, staff_account_id: str):
    """Return the conversation id the staff is currently marked as busy with, or None."""
    try:
        return get_key(_key_staff_busy(organization_id, staff_account_id))
    except Exception:
        return None


def mark_staff_busy(organization_id: str, staff_account_id: str, conv_id: str, ex: int = DEFAULT_BUSY_TTL_SECONDS):
    try:
        set_key(_key_staff_busy(organization_id, staff_account_id), str(conv_id), ex=ex)
        return True
    except Exception:
        return False


def clear_staff_busy(organization_id: str, staff_account_id: str):
    try:
        del_key(_key_staff_busy(organization_id, staff_account_id))
        return True
    except Exception:
        return False


def add_pending_support(organization_id: str, conv_id: str):
    """Append conv_id to a pending list for the org (best-effort, not strict queue semantics)."""
    if not organization_id or not conv_id:
        return None
    key = _key_pending(organization_id)
    raw = get_key(key)
    try:
        items = json.loads(raw) if raw else []
        if not isinstance(items, list):
            items = []
    except Exception:
        items = []

    # de-dup while preserving order
    conv_id_str = str(conv_id)
    items = [x for x in items if str(x) != conv_id_str]
    items.append(conv_id_str)
    try:
        set_key(key, json.dumps(items), ex=DEFAULT_PENDING_TTL_SECONDS)
    except Exception:
        pass
    return items


def pop_pending_support(organization_id: str):
    """Pop the oldest pending conv_id for the org. Returns conv_id or None."""
    if not organization_id:
        return None
    key = _key_pending(organization_id)
    raw = get_key(key)
    try:
        items = json.loads(raw) if raw else []
        if not isinstance(items, list) or not items:
            return None
    except Exception:
        return None

    conv_id = items.pop(0)
    try:
        set_key(key, json.dumps(items), ex=DEFAULT_PENDING_TTL_SECONDS)
    except Exception:
        pass
    return conv_id


def remove_pending_support(organization_id: str, conv_id: str):
    """Remove a specific conv_id from the pending list for the org. Returns updated list or None."""
    if not organization_id or not conv_id:
        return None
    key = _key_pending(organization_id)
    raw = get_key(key)
    try:
        items = json.loads(raw) if raw else []
        if not isinstance(items, list):
            items = []
    except Exception:
        items = []

    # Remove the specific conv_id
    conv_id_str = str(conv_id)
    items = [x for x in items if str(x) != conv_id_str]
    try:
        set_key(key, json.dumps(items), ex=DEFAULT_PENDING_TTL_SECONDS)
    except Exception:
        pass
    return items

