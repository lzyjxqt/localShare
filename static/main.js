// 检查是否为移动端
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 检查是否为本机访问
function isLocalAccess() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1';
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', function() {
    setupServerInfoSection(); // 设置"二维码和访问地址"部分的显示状态
    refreshIP();
    loadHistory();
    setupFileUpload();
});

// 设置"二维码和访问地址"部分的显示状态
function setupServerInfoSection() {
    const serverInfoSection = document.querySelector('.server-info'); // 选择"二维码和访问地址"部分
    if (!isLocalAccess()) {
        // 如果不是本机访问，隐藏整个部分
        serverInfoSection.style.display = 'none';
    }
}

// 刷新IP地址和二维码
function refreshIP() {
    fetch('/api/ip')
        .then(response => response.json())
        .then(data => {
            document.getElementById('serverUrl').textContent = data.url;
            generateQRCode(data.url);
        });
}

// 生成二维码
function generateQRCode(url) {
    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), {
        text: url,
        width: 128,
        height: 128
    });
}

// 分享文本
function shareText() {
    const text = document.getElementById('textInput').value.trim();
    if (!text) {
        alert('请输入要分享的文本');
        return;
    }

    fetch('/api/text', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: text })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('textInput').value = '';
            loadHistory();
        } else {
            alert('分享失败：' + (data.message || '未知错误'));
        }
    });
}

// 复制文本到剪贴板
function copyText(text) {
    const tempTextArea = document.getElementById('tempTextArea');
    tempTextArea.value = text;
    tempTextArea.select();
    document.execCommand('copy');
    alert('已复制到剪贴板');
}

// 设置文件上传相关功能
function setupFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const selectedFiles = document.getElementById('selectedFiles');
    const uploadButton = document.getElementById('uploadButton');
    const uploadProgress = document.getElementById('uploadProgress');

    fileInput.addEventListener('change', function() {
        selectedFiles.innerHTML = '';
        Array.from(this.files).forEach(file => {
            const div = document.createElement('div');
            div.textContent = `${file.name} (${formatFileSize(file.size)})`;
            selectedFiles.appendChild(div);
        });
    });

    uploadButton.removeEventListener('click', handleUpload);
    uploadButton.addEventListener('click', handleUpload);

    function handleUpload() {
        if (fileInput.files.length === 0) {
            alert('请选择要上传的文件');
            return;
        }

        const files = Array.from(fileInput.files);
        const totalFiles = files.length;
        let uploadedFiles = 0;
        
        // 创建进度显示容器
        uploadProgress.innerHTML = '';
        const progressBars = {};
        
        files.forEach(file => {
            const progressDiv = document.createElement('div');
            progressDiv.className = 'file-progress';
            progressDiv.innerHTML = `
                <div>${file.name}: <span class="progress-text">0%</span></div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
            `;
            uploadProgress.appendChild(progressDiv);
            progressBars[file.name] = {
                text: progressDiv.querySelector('.progress-text'),
                fill: progressDiv.querySelector('.progress-fill')
            };
        });

        // 并发上传，最多同时上传3个文件
        const concurrentUploads = 3;
        let currentIndex = 0;

        function uploadNext() {
            if (currentIndex >= files.length) return;
            
            const file = files[currentIndex++];
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();
            
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    progressBars[file.name].text.textContent = percentComplete + '%';
                    progressBars[file.name].fill.style.width = percentComplete + '%';
                }
            };

            xhr.onload = function() {
                uploadedFiles++;
                if (uploadedFiles === totalFiles) {
                    fileInput.value = '';
                    selectedFiles.innerHTML = '';
                    setTimeout(() => {
                        uploadProgress.innerHTML = '上传完成';
                        setTimeout(() => {
                            uploadProgress.innerHTML = '';
                        }, 3000);
                    }, 1000);
                    loadHistory();
                }
                // 继续上传下一个文件
                uploadNext();
            };

            xhr.onerror = function() {
                console.error('Upload failed for:', file.name);
                alert(`上传失败: ${file.name}`);
                uploadNext(); // 即使失败也继续上传下一个
            };

            xhr.open('POST', '/api/upload', true);
            xhr.send(formData);
        }

        // 启动初始的并发上传
        for (let i = 0; i < Math.min(concurrentUploads, files.length); i++) {
            uploadNext();
        }
    }
}

// 加载历史记录
function loadHistory() {
    fetch('/api/history')
        .then(response => response.json())
        .then(history => {
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';
            
            const showLocalButtons = !isMobileDevice() || isLocalAccess();
            
            history.reverse().forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-item';
                
                if (item.type === 'text') {
                    div.innerHTML = `
                        <div class="history-item-content">
                            <div class="history-item-time">${item.time}</div>
                            <div class="history-item-text">${item.content}</div>
                        </div>
                        <div class="history-item-buttons">
                            <button onclick="copyText('${item.content.replace(/'/g, "\\'")}')">复制</button>
                            <button class="delete-button" onclick="deleteHistory('${item.id}')">删除</button>
                        </div>
                    `;
                } else {
                    let buttons = `
                        <button onclick="window.open('/uploads/${item.saved_name}', '_blank')">下载</button>
                        <button class="delete-button" onclick="deleteHistory('${item.id}')">删除</button>
                    `;
                    
                    if (showLocalButtons) {
                        buttons = `
                            <button class="open-local-only" onclick="openFile('${item.saved_name}')">打开</button>
                            <button class="open-local-only" onclick="openFolder('${item.saved_name}')">跳转</button>
                            ${buttons}
                        `;
                    }
                    
                    div.innerHTML = `
                        <div class="history-item-content">
                            <div class="history-item-time">${item.time}</div>
                            <div class="history-item-filename">${item.original_name}</div>
                        </div>
                        <div class="history-item-buttons">
                            ${buttons}
                        </div>
                    `;
                }
                
                historyList.appendChild(div);
            });
        });
}

// 打开文件
function openFile(filename) {
    fetch(`/api/open/${filename}`)
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                alert('打开文件失败：' + (data.message || '未知错误'));
            }
        });
}

// 在文件管理器中打开文件位置
function openFolder(filename) {
    fetch(`/api/open_folder/${filename}`)
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                alert('打开文件夹失败：' + (data.message || '未知错误'));
            }
        });
}

// 清空历史记录
function clearAllHistory() {
    if (!confirm('确定要清空所有历史记录吗？此操作不可恢复！')) {
        return;
    }
    
    fetch('/api/clear_history', {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadHistory();
        } else {
            alert('清空历史失败：' + (data.message || '未知错误'));
        }
    });
}

// 删除单个历史记录
function deleteHistory(id) {
    if (!confirm('确定要删除这条记录吗？')) {
        return;
    }
    
    fetch(`/api/delete_history/${id}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadHistory();
        } else {
            alert('删除失败：' + (data.message || '未知错误'));
        }
    });
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
