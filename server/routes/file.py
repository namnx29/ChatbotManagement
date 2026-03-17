from flask import Blueprint, jsonify, request, send_file, current_app
import requests
import os
import logging
from config import Config
from io import BytesIO
import json
from datetime import datetime
from models.message import MessageModel

file_bp = Blueprint('file', __name__)
logger = logging.getLogger(__name__)

AI_BASE_API = "https://microtunchat-app-1012095270393.us-central1.run.app"

USERNAME = Config.AI_API_USERNAME
PASSWORD = Config.AI_API_PASSWORD


@file_bp.route("/api/files", methods=["GET"])
def get_list_files():
    try:
        res = requests.get(
            f"{AI_BASE_API}/gcs/files",
            auth=(USERNAME, PASSWORD)
        )

        return jsonify(res.json())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@file_bp.route("/api/upload", methods=["POST"])
def upload_file():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]

        files = {
            "file": (file.filename, file.stream, file.mimetype)
        }

        res = requests.post(
            f"{AI_BASE_API}/gcs/upload",
            auth=(USERNAME, PASSWORD),
            files=files
        )

        return jsonify(res.json())

    except Exception as e:
        logger.error(e)
        return jsonify({"error": str(e)}), 500

@file_bp.route("/api/files/<filename>", methods=["DELETE"])
def delete_file(filename):
    try:
        res = requests.delete(
            f"{AI_BASE_API}/gcs/files/{filename}",
            auth=(USERNAME, PASSWORD)
        )

        return jsonify(res.json())

    except Exception as e:
        logger.error(e)
        return jsonify({"error": str(e)}), 500


@file_bp.route("/api/export-training-json", methods=["GET"])
def export_training_json():
    try:
        message_model = MessageModel(current_app.mongo_client)

        # Get messages using raw collection (since model may not have this method)
        messages = list(
            message_model.collection.find({
                "bot_reply": {"$ne": True},
            }).sort([
                ("conversation_id", 1),
                ("created_at", 1)
            ])
        )

        # Group by conversation
        conversations = {}
        for msg in messages:
            cid = str(msg.get("conversation_id"))

            if cid not in conversations:
                conversations[cid] = []

            conversations[cid].append(msg)

        # Build Q&A
        training_data = []

        for conv_id, msgs in conversations.items():
            question = None

            for m in msgs:
                direction = m.get("direction")
                text = m.get("text")

                if not text:
                    continue

                if direction == "in":
                    question = text

                elif direction == "out" and question:
                    training_data.append({
                        "question": question,
                        "answer": text,
                        "conversation_id": conv_id
                    })
                    question = None

        # Convert to JSON file
        json_data = json.dumps(training_data, ensure_ascii=False, indent=2)

        buffer = BytesIO()
        buffer.write(json_data.encode("utf-8"))
        buffer.seek(0)

        filename = f"training_data_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

        return send_file(
            buffer,
            mimetype="application/json",
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        logger.error(e)
        return jsonify({"error": str(e)}), 500