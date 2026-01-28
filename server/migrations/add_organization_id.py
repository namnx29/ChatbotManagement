#!/usr/bin/env python3
"""
Migration script to add organizationId field to all collections
Run after deploying the updated code to add organizationId to existing documents

Usage:
    python migrations/add_organization_id.py

This script:
1. For admin users: Generates new organizationId UUIDs (if not already present)
2. For staff users: Copies organizationId from parent admin account
3. For conversations: Matches conversations to organizationId based on accountId owner
4. For messages: Matches messages to organizationId based on accountId owner
5. For integrations: Matches integrations to organizationId based on accountId owner
6. For chatbots: Matches chatbots to organizationId based on accountId owner
"""

import sys
import os
import uuid
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import Config
from pymongo import MongoClient

def migrate_organization_ids():
    """Run the migration"""
    
    try:
        # Connect to MongoDB
        mongo_client = MongoClient(Config.MONGO_URI)
        db = mongo_client.test_db
        logger.info(f"Connected to MongoDB: {Config.MONGO_URI}")
        
        # ===== Step 1: Admin users - generate organizationId if missing =====
        logger.info("Step 1: Processing admin users...")
        admin_users = db.users.find({'role': 'admin', 'organizationId': {'$exists': False}})
        admin_count = 0
        for user in admin_users:
            org_id = str(uuid.uuid4())
            db.users.update_one(
                {'_id': user['_id']},
                {'$set': {'organizationId': org_id, 'updatedAt': datetime.utcnow()}}
            )
            logger.info(f"  Generated organizationId for admin user {user.get('accountId')}: {org_id}")
            admin_count += 1
        logger.info(f"  ✓ Generated organizationId for {admin_count} admin users")
        
        # Build map of accountId -> organizationId for admins
        admin_org_map = {}
        for user in db.users.find({'role': 'admin', 'organizationId': {'$exists': True}}):
            admin_org_map[user['accountId']] = user['organizationId']
        logger.info(f"  ✓ Built admin->org map with {len(admin_org_map)} entries")
        
        # ===== Step 2: Staff users - copy organizationId from parent admin =====
        logger.info("Step 2: Processing staff users...")
        staff_users = db.users.find({'role': 'staff'})
        staff_count = 0
        for user in staff_users:
            if not user.get('organizationId') and user.get('parent_account_id'):
                parent_org_id = admin_org_map.get(user['parent_account_id'])
                if parent_org_id:
                    db.users.update_one(
                        {'_id': user['_id']},
                        {'$set': {'organizationId': parent_org_id, 'updatedAt': datetime.utcnow()}}
                    )
                    logger.info(f"  Copied organizationId to staff user {user.get('accountId')}: {parent_org_id}")
                    staff_count += 1
                else:
                    logger.warning(f"  Could not find parent organizationId for staff user {user.get('accountId')}")
        logger.info(f"  ✓ Copied organizationId to {staff_count} staff users")
        
        # Build complete map of accountId -> organizationId
        complete_org_map = {}
        for user in db.users.find({'organizationId': {'$exists': True}}):
            complete_org_map[user['accountId']] = user['organizationId']
        logger.info(f"  ✓ Built complete account->org map with {len(complete_org_map)} entries")
        
        # ===== Step 3: Conversations - add organizationId based on accountId =====
        logger.info("Step 3: Processing conversations...")
        conv_count = 0
        for account_id, org_id in complete_org_map.items():
            result = db.conversations.update_many(
                {'accountId': account_id, 'organizationId': {'$exists': False}},
                {'$set': {'organizationId': org_id, 'updated_at': datetime.utcnow()}}
            )
            if result.modified_count > 0:
                logger.info(f"  Updated {result.modified_count} conversations for account {account_id}")
                conv_count += result.modified_count
        logger.info(f"  ✓ Updated organizationId for {conv_count} conversations")
        
        # ===== Step 4: Messages - add organizationId based on accountId =====
        logger.info("Step 4: Processing messages...")
        msg_count = 0
        for account_id, org_id in complete_org_map.items():
            result = db.messages.update_many(
                {'accountId': account_id, 'organizationId': {'$exists': False}},
                {'$set': {'organizationId': org_id, 'updated_at': datetime.utcnow()}}
            )
            if result.modified_count > 0:
                logger.info(f"  Updated {result.modified_count} messages for account {account_id}")
                msg_count += result.modified_count
        logger.info(f"  ✓ Updated organizationId for {msg_count} messages")
        
        # ===== Step 5: Integrations - add organizationId based on accountId =====
        logger.info("Step 5: Processing integrations...")
        int_count = 0
        for account_id, org_id in complete_org_map.items():
            result = db.integrations.update_many(
                {'accountId': account_id, 'organizationId': {'$exists': False}},
                {'$set': {'organizationId': org_id, 'updated_at': datetime.utcnow()}}
            )
            if result.modified_count > 0:
                logger.info(f"  Updated {result.modified_count} integrations for account {account_id}")
                int_count += result.modified_count
        logger.info(f"  ✓ Updated organizationId for {int_count} integrations")
        
        # ===== Step 6: Chatbots - add organizationId based on accountId =====
        logger.info("Step 6: Processing chatbots...")
        bot_count = 0
        for account_id, org_id in complete_org_map.items():
            result = db.chatbots.update_many(
                {'accountId': account_id, 'organizationId': {'$exists': False}},
                {'$set': {'organizationId': org_id, 'updated_at': datetime.utcnow()}}
            )
            if result.modified_count > 0:
                logger.info(f"  Updated {result.modified_count} chatbots for account {account_id}")
                bot_count += result.modified_count
        logger.info(f"  ✓ Updated organizationId for {bot_count} chatbots")
        
        # ===== Summary =====
        logger.info("\n" + "="*60)
        logger.info("MIGRATION COMPLETE")
        logger.info("="*60)
        logger.info(f"Admin users processed:      {admin_count}")
        logger.info(f"Staff users processed:      {staff_count}")
        logger.info(f"Conversations updated:      {conv_count}")
        logger.info(f"Messages updated:           {msg_count}")
        logger.info(f"Integrations updated:       {int_count}")
        logger.info(f"Chatbots updated:           {bot_count}")
        logger.info(f"Total documents updated:    {admin_count + staff_count + conv_count + msg_count + int_count + bot_count}")
        logger.info("="*60)
        
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        return False
    finally:
        mongo_client.close()
        logger.info("MongoDB connection closed")


if __name__ == '__main__':
    success = migrate_organization_ids()
    sys.exit(0 if success else 1)
