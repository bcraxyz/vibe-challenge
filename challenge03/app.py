import os
import json
import requests
import ipaddress
from datetime import datetime
from urllib.parse import urlparse
from flask import Flask, request, jsonify, send_from_directory, render_template

# --- Imports for Linkwise Logic ---
from flask_cors import CORS
import firebase_admin
from firebase_admin import auth
from google.cloud import firestore
from google import genai
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# --- Config & Init ---
google_cloud_project = os.environ.get("GOOGLE_CLOUD_PROJECT")
google_cloud_location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

if not google_cloud_project:
    print("Warning: GOOGLE_CLOUD_PROJECT not set. Firestore/Gemini may fail.")

if not firebase_admin._apps:
    firebase_admin.initialize_app(options={"projectId": google_cloud_project})

db = firestore.Client(project=google_cloud_project)
try:
    client = genai.Client(vertexai=True, project=google_cloud_project, location=google_cloud_location)
except Exception as e:
    print(f"GenAI Init Warning: {e}")
    client = None

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app, supports_credentials=True)


# ==========================================
# HELPER FUNCTIONS (From Linkwise)
# ==========================================

def verify_token():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = auth_header.replace("Bearer ", "")
    decoded = auth.verify_id_token(token)
    return decoded["uid"], decoded.get("email")

def safe_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        raise ValueError("Invalid URL scheme")
    hostname = parsed.hostname or ''
    if hostname in ['localhost', '127.0.0.1', '::1']:
        raise ValueError("Localhost access denied")
    return True

def extract_article_content(url):
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
            candidates = sorted(soup.find_all(['div', 'section']), key=lambda el: len(el.get_text(strip=True)), reverse=True)
            main_content = candidates[0] if candidates else soup.body

        text = main_content.get_text(separator=' ', strip=True) if main_content else ''
        title = soup.title.string.strip() if soup.title and soup.title.string else url

        return {'title': title, 'content': text[:5000], 'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def generate_summary_and_tags(content, title):
    if not client:
        return {'summary': f"AI Summary Unavailable. Title: {title}", 'tags': ['saved']}
    try:
        prompt = f"""Analyze this article. Provide valid JSON only: {{"summary": "2 sentences", "tags": ["tag1", "tag2"]}}. Title: {title}. Content: {content[:3000]}"""
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        txt = response.text.strip()
        if '```' in txt: txt = txt.split('```')[1].replace('json','').strip()
        return json.loads(txt)
    except Exception as e:
        print(f"Gemini Error: {e}")
        return {'summary': f"Article: {title}", 'tags': ['saved']}

def format_link_doc(doc):
    d = doc.to_dict()
    return {
        "id": doc.id, "url": d.get("url"), "title": d.get("title"),
        "summary": d.get("summary"), "tags": d.get("tags") or [],
        "createdAt": d.get("createdAt").isoformat() if d.get("createdAt") else None
    }

# ==========================================
# SAAS ROUTES
# ==========================================

@app.route("/")
def index():
    return render_template("landing.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

# Serve Turbo-Do (Static)
@app.route("/apps/turbodo/")
def turbodo_index():
    return send_from_directory("static/turbodo", "index.html")

@app.route("/apps/turbodo/<path:filename>")
def turbodo_files(filename):
    return send_from_directory("static/turbodo", filename)

# Serve Linkwise (Static)
@app.route("/apps/linkwise/")
def linkwise_index():
    return send_from_directory("static/linkwise", "index.html")

@app.route("/apps/linkwise/<path:filename>")
def linkwise_files(filename):
    return send_from_directory("static/linkwise", filename)


# ==========================================
# LINKWISE API ENDPOINTS
# ==========================================

@app.route("/api/links", methods=["GET"])
def get_links():
    try:
        user_id, _ = verify_token()
        docs = db.collection("links").where("userId", "==", user_id).order_by("createdAt", direction=firestore.Query.DESCENDING).stream()
        return jsonify({"links": [format_link_doc(d) for d in docs], "success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 401

@app.route("/api/links", methods=["POST"])
def add_link():
    try:
        user_id, _ = verify_token()
        data = request.get_json(silent=True) or {}
        url = data.get("url", "").strip()
        if not url: return jsonify({"error": "URL required"}), 400

        article = extract_article_content(url)
        if not article['success']: return jsonify({'error': 'Failed to extract content'}), 400

        ai = generate_summary_and_tags(article['content'], article['title'])
        
        doc_ref = db.collection("links").document()
        new_link = {
            "userId": user_id, "url": url, "title": article['title'],
            "summary": ai['summary'], "tags": ai['tags'], "createdAt": firestore.SERVER_TIMESTAMP
        }
        doc_ref.set(new_link)
        
        # Return simplified for frontend
        new_link["id"] = doc_ref.id
        new_link["createdAt"] = datetime.now().isoformat()
        return jsonify({"link": new_link, "success": True})
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

@app.route("/api/health")
def health():
    return jsonify({"status": "healthy"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
