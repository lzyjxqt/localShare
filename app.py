import os
import json
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, render_template
import socket
import subprocess
import platform

app = Flask(__name__)

# 配置
UPLOAD_FOLDER = "uploads"
HISTORY_FILE = "history.json"
PORT = 12345

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# 加载历史记录
def load_history():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

# 保存历史记录
def save_history():
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

history = load_history()

# 获取主机 IP 地址
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # 尝试连接到一个公共的外部地址
        s.connect(("114.114.114.114", 80))
        ip = s.getsockname()[0]  # 获取本地的出口 IP 地址

        # 如果获取到的 IP 是局域网地址（例如 192 198 172 开头），则尝试连接到局域网网关
        if ip[:3] in ("192", "198", "172"):
            s.connect(("192.168.0.1", 80))  # 尝试连接到局域网网关
            ip = s.getsockname()[0]

        else:
            pass
    except Exception as e:
        raise(f"获取 IP 时发生错误: {e}")
    finally:
        s.close()
    return ip

# 路由: 主页
@app.route("/")
def index():
    return render_template("index.html")

# 路由: 获取服务器IP地址
@app.route("/api/ip")
def get_ip():
    ip = get_local_ip()
    return jsonify({"url": f"http://{ip}:{PORT}"})

# 路由: 获取 favicon
@app.route("/favicon.ico")
def favicon():
    return send_from_directory(os.path.join(app.root_path, "static"),
                             "favicon.ico", mimetype="image/vnd.microsoft.icon")


# 路由: 分享文本
@app.route("/api/text", methods=["POST"])
def share_text():
    try:
        data = request.get_json()
        text = data.get("text", "").strip()
        if not text:
            return jsonify({"success": False, "message": "文本内容不能为空"})
        
        history.append({
            "id": str(uuid.uuid4()),
            "type": "text",
            "content": text,
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        save_history()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# 路由: 上传文件
@app.route("/api/upload", methods=["POST"])
def upload_file():
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "message": "没有文件被上传"})
        
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "message": "没有选择文件"})
        
        # 使用原始文件名，如果文件已存在则添加序号
        filename = file.filename
        base, ext = os.path.splitext(filename)
        counter = 1
        
        while os.path.exists(os.path.join(UPLOAD_FOLDER, filename)):
            filename = f"{base}({counter}){ext}"
            counter += 1
        
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        history.append({
            "id": str(uuid.uuid4()),
            "type": "file",
            "original_name": file.filename,
            "saved_name": filename,  # 现在saved_name就是实际保存的文件名
            "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        })
        save_history()
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# 路由: 获取历史记录
@app.route("/api/history")
def get_history():
    return jsonify(history)

# 路由: 下载文件
@app.route("/uploads/<filename>")
def download_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# 路由: 打开文件
@app.route("/api/open/<filename>")
def open_file(filename):
    try:
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(file_path):
            return jsonify({"success": False, "message": "文件不存在"})
        
        if platform.system() == "Windows":
            os.startfile(file_path)
        elif platform.system() == "Darwin":  # macOS
            subprocess.call(["open", file_path])
        else:  # Linux
            subprocess.call(["xdg-open", file_path])
            
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# 路由: 在文件管理器中打开
@app.route("/api/open_folder/<filename>")
def open_folder(filename):
    try:
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        if not os.path.exists(file_path):
            return jsonify({"success": False, "message": "文件不存在"})
        
        if platform.system() == "Windows":
            subprocess.run(["explorer", "/select,", file_path])
        elif platform.system() == "Darwin":  # macOS
            subprocess.run(["open", "-R", file_path])
        else:  # Linux
            subprocess.run(["xdg-open", os.path.dirname(file_path)])
            
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# 路由: 清空历史记录
@app.route("/api/clear_history", methods=["POST"])
def clear_history():
    try:
        # 删除所有文件
        for file in os.listdir(UPLOAD_FOLDER):
            file_path = os.path.join(UPLOAD_FOLDER, file)
            if os.path.isfile(file_path):
                os.remove(file_path)
        
        # 清空历史记录
        history.clear()
        save_history()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

# 路由: 删除单个历史记录
@app.route("/api/delete_history/<item_id>", methods=["DELETE"])
def delete_history(item_id):
    try:
        # 查找并删除对应的历史记录
        for item in history[:]:
            if item["id"] == item_id:
                if item["type"] == "file":
                    # 删除文件
                    file_path = os.path.join(UPLOAD_FOLDER, item["saved_name"])
                    if os.path.exists(file_path):
                        os.remove(file_path)
                history.remove(item)
                break
        
        save_history()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=12345)
