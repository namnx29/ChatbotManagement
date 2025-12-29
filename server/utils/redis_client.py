import time
import logging
from config import Config

logger = logging.getLogger(__name__)

class InMemoryStore:
    def __init__(self):
        self._data = {}

    def set(self, key, value, ex=None):
        expire_at = None
        if ex:
            expire_at = time.time() + ex
        self._data[key] = (value, expire_at)

    def get(self, key):
        val = self._data.get(key)
        if not val:
            return None
        value, expire_at = val
        if expire_at and time.time() > expire_at:
            del self._data[key]
            return None
        return value

    def delete(self, key):
        if key in self._data:
            del self._data[key]


try:
    import redis
    redis_client = redis.from_url(Config.REDIS_URL)
    # Quick test connection
    try:
        redis_client.ping()
    except Exception as e:
        logger.warning(f"Redis ping failed: {e}; falling back to in-memory store")
        redis_client = InMemoryStore()
except Exception as e:
    logger.warning(f"Redis not available ({e}); using in-memory store for PKCE storage")
    redis_client = InMemoryStore()


def set_key(key, value, ex=None):
    try:
        if hasattr(redis_client, 'set'):
            return redis_client.set(key, value, ex=ex)
        else:
            # InMemoryStore
            redis_client.set(key, value, ex=ex)
            return True
    except Exception as e:
        logger.error(f"Redis set error: {e}")
        return False


def get_key(key):
    try:
        if hasattr(redis_client, 'get'):
            val = redis_client.get(key)
            # redis returns bytes when using real redis
            if isinstance(val, bytes):
                return val.decode('utf-8')
            return val
        else:
            return redis_client.get(key)
    except Exception as e:
        logger.error(f"Redis get error: {e}")
        return None


def del_key(key):
    try:
        if hasattr(redis_client, 'delete'):
            return redis_client.delete(key)
        else:
            return redis_client.delete(key)
    except Exception as e:
        logger.error(f"Redis delete error: {e}")
        return None
