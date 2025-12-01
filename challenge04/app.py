import os
import json
import requests
import ipaddress
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import firebase_admin
from firebase_admin import auth
from google.cloud import firestore
from google import genai
from google.genai import types
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

google_cloud_project = os.environ.get("GOOGLE_CLOUD_PROJECT")
if not google_cloud_project:
    raise RuntimeError("GOOGLE_CLOUD_PROJECT must be set in environment.")
google_cloud_location = os.environ.get("GOOGLE_CLOUD_LOCATION")
if not google_cloud_location:
    raise RuntimeError("GOOGLE_CLOUD_LOCATION must be set in environment.")

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": google_cloud_project})
db = firestore.Client(project=google_cloud_project)
client = genai.Client(vertexai=True, project=google_cloud_project, location=google_cloud_location)

app = Flask(__name__, static_folder="static")
app.config.update({
    'SESSION_COOKIE_SECURE': True,
    'SESSION_COOKIE_HTTPONLY': True,
    'SESSION_COOKIE_SAMESITE': 'Lax',
})
CORS(app, supports_credentials=True)

def verify_token():
    """Verify Firebase ID token from Authorization header"""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = auth_header.replace("Bearer ", "")
    decoded = auth.verify_id_token(token)
    return decoded["uid"], decoded.get("email")

def safe_url(url):
    """Basic SSRF protection — allow only http/https and block private/internal hosts."""
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        raise ValueError("Invalid URL scheme")
    hostname = parsed.hostname or ''
    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
            raise ValueError("Access to private/internal IPs not allowed")
    except ValueError:
        if hostname.endswith(('.local', '.internal')):
            raise ValueError("Access to local/internal domains not allowed")
    return True

def extract_article_content(url):
    """Extract article content using BeautifulSoup"""
    try:
        safe_url(url)
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, 'html.parser')
        for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
            tag.decompose()

        main_content = soup.find('article') or soup.find('main')
        if not main_content:
            candidates = sorted(
                soup.find_all(['div', 'section']),
                key=lambda el: len(el.get_text(strip=True)),
                reverse=True
            )
            main_content = candidates[0] if candidates else soup.body

        text = main_content.get_text(separator=' ', strip=True) if main_content else ''
        title = soup.title.string.strip() if soup.title and soup.title.string else url

        return {'title': title, 'content': text[:5000], 'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def generate_summary_and_tags(content, title):
    """Generate summary and tags using Gemini"""
    try:
        prompt = f"""Analyze this article and provide:
        1. A concise 2-3 sentence summary
        2. 3-5 relevant tags (single words, camelCase if needed)
        
        Title: {title}
        Content: {content[:3000]}
        
        Examples of good tags: ["AI", "Technology", "Security", "GoogleCloud", "OpenSource"]
        Examples of bad tags: ["Machine Learning", "Cloud Computing", "Web Development"]
        
        Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
        {{"summary": "...", "tags": ["tag1", "tag2"]}}"""

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt
        )

        response_text = response.text.strip()
        if '```' in response_text:
            parts = response_text.split('```')
            for part in parts:
                part = part.strip()
                if part.startswith('json'):
                    part = part[4:].strip()
                if part.startswith('{') and part.endswith('}'):
                    response_text = part
                    break

        result = json.loads(response_text)
        
        if 'summary' not in result or 'tags' not in result:
            raise ValueError("Invalid response format")
        return result
    except Exception as e:
        print(f"Gemini API error: {type(e).__name__}: {e}")
        return {'summary': f"Article: {title}", 'tags': ['saved']}

def get_json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}

def format_link_doc(doc):
    data = doc.to_dict()
    return {
        "id": doc.id,
        "url": data.get("url"),
        "title": data.get("title"),
        "summary": data.get("summary"),
        "tags": data.get("tags") or [],
        "createdAt": data.get("createdAt").isoformat() if data.get("createdAt") else None
    }

@app.route("/")
def index():
    return send_from_directory("static", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory("static", path)

@app.route("/api/links", methods=["GET"])
def get_links():
    try:
        user_id, _ = verify_token()
        links_ref = db.collection("links").where("userId", "==", user_id)
        docs = links_ref.order_by("createdAt", direction=firestore.Query.DESCENDING).stream()
        links = [format_link_doc(doc) for doc in docs]
        return jsonify({"links": links, "success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 401

@app.route("/api/links", methods=["POST"])
def add_link():
    try:
        user_id, _ = verify_token()
        data = get_json()
        url = data.get("url", "").strip()
        if not url:
            return jsonify({"error": "URL required"}), 400

        article = extract_article_content(url)
        if not article.get('success', False):
            return jsonify({'error': 'Failed to extract article content'}), 400

        ai_result = generate_summary_and_tags(article['content'], article['title'])

        doc_ref = db.collection("links").document()
        doc_ref.set({
            "userId": user_id,
            "url": url,
            "title": article['title'],
            "summary": ai_result['summary'],
            "tags": ai_result['tags'],
            "createdAt": firestore.SERVER_TIMESTAMP
        })

        link_data = {
            "id": doc_ref.id,
            "url": url,
            "title": article['title'],
            "summary": ai_result['summary'],
            "tags": ai_result['tags'],
            "createdAt": datetime.now().isoformat()
        }
        return jsonify({"link": link_data, "success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 401

@app.route("/api/links/<link_id>", methods=["DELETE"])
def delete_link(link_id):
    try:
        user_id, _ = verify_token()
        doc_ref = db.collection("links").document(link_id)
        doc = doc_ref.get()
        if not doc.exists or doc.to_dict().get("userId") != user_id:
            return jsonify({"error": "Link not found"}), 404
        doc_ref.delete()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 401

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)
