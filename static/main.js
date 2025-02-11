// 轮询相关变量
let pollingInterval = null; // 轮询定时器
let lastHistoryLength = 0; // 上次历史记录长度
let isUploading = false; // 是否正在上传文件

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
    startPolling(); // 启动轮询
});

// 轮询控制函数
function startPolling() {
    // 如果已经在轮询中，先停止
    stopPolling();
    // 每2秒检查一次历史记录
    pollingInterval = setInterval(checkForUpdates, 2000);
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// 检查更新函数
function checkForUpdates() {
    // 如果正在上传文件，跳过这次检查
    if (isUploading) {
        return;
    }

    fetch('/api/history')
        .then(response => response.json())
        .then(history => {
            // 如果历史记录数量发生变化，说明有更新
            if (history.length !== lastHistoryLength) {
                loadHistory();
                lastHistoryLength = history.length;
            }
        })
        .catch(error => {
            console.error('检查更新失败:', error);
            stopPolling();
        });
}

// 设置"二维码和访问地址"部分的显示状态
function setupServerInfoSection() {
    const serverInfoSection = document.querySelector('.server-info');
    if (!isLocalAccess()) {
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
    // 使用 navigator.clipboard API (现代浏览器)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => alert('已复制到剪贴板'))
            .catch(err => {
        console.error('复制失败:', err);
                fallbackCopyText(text);
            });
                } else {
        fallbackCopyText(text);
        }
}

// 复制文本的后备方法
function fallbackCopyText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    
    try {
        textArea.select();
        textArea.setSelectionRange(0, 99999);
        const successful = document.execCommand('copy');
        if (successful) {
            alert('已复制到剪贴板');
                } else {
            throw new Error('复制命令执行失败');
        }
    } catch (err) {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    } finally {
        document.body.removeChild(textArea);
    }
}

// 设置文件上传相关功能
function setupFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const selectedFiles = document.getElementById('selectedFiles');
    const uploadButton = document.getElementById('uploadButton');
    const uploadProgress = document.getElementById('uploadProgress');

    fileInput.addEventListener('change', function() {
        selectedFiles.innerHTML = '';
        if (this.files.length > 0) {
            Array.from(this.files).forEach(file => {
                const div = document.createElement('div');
                div.textContent = `${file.name} (${formatFileSize(file.size)})`;
                selectedFiles.appendChild(div);
            });
            uploadButton.style.display = 'block';
        } else {
            uploadButton.style.display = 'none';
        }
    });

    uploadButton.addEventListener('click', handleUpload);
}

// 处理文件上传
function handleUpload() {
    const fileInput = document.getElementById('fileInput');
    const selectedFiles = document.getElementById('selectedFiles');
    const uploadProgress = document.getElementById('uploadProgress');

    if (fileInput.files.length === 0) {
        alert('请选择要上传的文件');
        return;
    }
    
    isUploading = true;
    const files = Array.from(fileInput.files);
    const totalFiles = files.length;
    let uploadedFiles = 0;
    
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
                uploadButton.style.display = 'none';
                setTimeout(() => {
                    uploadProgress.innerHTML = '上传完成';
                    setTimeout(() => {
                        uploadProgress.innerHTML = '';
                    }, 3000);
                }, 1000);
            loadHistory();
                isUploading = false;
        }
            uploadNext();
        };

        xhr.onerror = function() {
            console.error('Upload failed for:', file.name);
            alert(`上传失败: ${file.name}`);
            if (uploadedFiles === totalFiles) {
                isUploading = false;
}
            uploadNext();
        };

        xhr.open('POST', '/api/upload', true);
        xhr.send(formData);
    }

    for (let i = 0; i < Math.min(concurrentUploads, files.length); i++) {
        uploadNext();
    }
}

// 加载历史记录
function loadHistory() {
    fetch('/api/history')
        .then(response => response.json())
        .then(history => {
            lastHistoryLength = history.length;
            const historyList = document.getElementById('historyList');
            historyList.innerHTML = '';
            
            const showLocalButtons = !isMobileDevice() || isLocalAccess();
            
            history.reverse().forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-item';
                
                if (item.type === 'text') {
                    // 创建文本内容容器
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'history-item-content';
                    
                    // 创建时间显示
                    const timeDiv = document.createElement('div');
                    timeDiv.className = 'history-item-time';
                    timeDiv.textContent = item.time;
                    
                    // 创建文本内容显示
                    const textDiv = document.createElement('div');
                    textDiv.className = 'history-item-text';
                    textDiv.style.whiteSpace = 'pre-wrap';
                    textDiv.textContent = item.content;
                    
                    contentDiv.appendChild(timeDiv);
                    contentDiv.appendChild(textDiv);
                    
                    // 创建按钮容器
                    const buttonsDiv = document.createElement('div');
                    buttonsDiv.className = 'history-item-buttons';
                    
                    // 创建复制按钮
                    const copyButton = document.createElement('button');
                    copyButton.textContent = '复制';
                    copyButton.onclick = () => copyText(item.content);
                    
                    // 创建删除按钮
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = '删除';
                    deleteButton.className = 'delete-button';
                    deleteButton.onclick = () => deleteHistory(item.id);
                    
                    buttonsDiv.appendChild(copyButton);
                    buttonsDiv.appendChild(deleteButton);
                    
                    div.appendChild(contentDiv);
                    div.appendChild(buttonsDiv);
                } else {
                    // 创建文件内容容器
                    const contentDiv = document.createElement('div');
                    contentDiv.className = 'history-item-content';
                    
                    // 创建时间显示
                    const timeDiv = document.createElement('div');
                    timeDiv.className = 'history-item-time';
                    timeDiv.textContent = item.time;
                    
                    // 创建文件名显示
                    const filenameDiv = document.createElement('div');
                    filenameDiv.className = 'history-item-filename';
                    filenameDiv.textContent = item.original_name;
                    
                    contentDiv.appendChild(timeDiv);
                    contentDiv.appendChild(filenameDiv);
                    
                    // 创建按钮容器
                    const buttonsDiv = document.createElement('div');
                    buttonsDiv.className = 'history-item-buttons';
                    
                    if (showLocalButtons) {
                        // 创建打开按钮
                        const openButton = document.createElement('button');
                        openButton.textContent = '打开';
                        openButton.className = 'open-local-only';
                        openButton.onclick = () => openFile(item.saved_name);
                        
                        // 创建跳转按钮
                        const folderButton = document.createElement('button');
                        folderButton.textContent = '跳转';
                        folderButton.className = 'open-local-only';
                        folderButton.onclick = () => openFolder(item.saved_name);
                        
                        buttonsDiv.appendChild(openButton);
                        buttonsDiv.appendChild(folderButton);
                    }
                    
                    // 创建下载按钮
                    const downloadButton = document.createElement('button');
                    downloadButton.textContent = '下载';
                    downloadButton.onclick = () => window.open('/uploads/' + item.saved_name, '_blank');
                    
                    // 创建删除按钮
                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = '删除';
                    deleteButton.className = 'delete-button';
                    deleteButton.onclick = () => deleteHistory(item.id);
                    
                    buttonsDiv.appendChild(downloadButton);
                    buttonsDiv.appendChild(deleteButton);
                    
                    div.appendChild(contentDiv);
                    div.appendChild(buttonsDiv);
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