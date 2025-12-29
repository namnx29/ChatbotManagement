import logging
from config import Config

logger = logging.getLogger(__name__)

try:
    import openai
except Exception:
    openai = None


class AIService:
    @staticmethod
    def generate_reply(account_id, message_text):
        # Note: account_id is accepted for API compatibility (providers may need it),
        # but currently not used by the built-in providers.
        provider = Config.AI_PROVIDER or 'mock'
        if provider == 'openai' and openai:
            try:
                openai.api_key = Config.AI_API_KEY
                # Use ChatCompletion if available; keep minimal for tests
                resp = openai.ChatCompletion.create(
                    model='gpt-3.5-turbo',
                    messages=[{'role': 'user', 'content': message_text}],
                    max_tokens=256
                )
                reply = resp.choices[0].message.content.strip()
                return reply
            except Exception as e:
                logger.error(f"OpenAI request failed: {e}")
                # fallback
                return f"(AI error) Sorry, we couldn't process your message."
        else:
            # Mock response for tests
            logger.info("Using mock AI provider to generate reply")
            return f"[Mock reply] You said: {message_text}"


# For convenience expose module-level function

def generate_reply(account_id, message_text):
    return AIService.generate_reply(account_id, message_text)
