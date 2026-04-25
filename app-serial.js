let port = null;
let reader = null;
let writer = null;
let keepReading = false;
let decoder = new TextDecoder('utf-8');
let encoder = new TextEncoder('utf-8');

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const clearBtn = document.getElementById('clearBtn');
const sendBtn = document.getElementById('sendBtn');
const sendInput = document.getElementById('sendInput');
const baudRateSelect = document.getElementById('baudRate');
const displayModeSelect = document.getElementById('displayMode');
const sendModeSelect = document.getElementById('sendMode');
const newlineTypeSelect = document.getElementById('newlineType');
const statusDiv = document.getElementById('status');
const dataLog = document.getElementById('dataLog');

function updateStatus(message, isConnected) {
    statusDiv.textContent = `状态: ${message}`;
    if (isConnected) {
        statusDiv.classList.remove('status-disconnected');
        statusDiv.classList.add('status-connected');
    } else {
        statusDiv.classList.remove('status-connected');
        statusDiv.classList.add('status-disconnected');
    }
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function hexToBytes(hexStr) {
    const cleaned = hexStr.replace(/\s/g, '');
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < cleaned.length; i += 2) {
        bytes[i / 2] = parseInt(cleaned.substr(i, 2), 16);
    }
    return bytes;
}

function logData(data, isSend = false, rawBytes = null) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = isSend ? '[发送]' : '[接收]';
    const className = isSend ? 'log-send' : 'log-receive';
    const displayMode = displayModeSelect.value;
    
    let displayStr;
    if (displayMode === 'hex' && rawBytes) {
        displayStr = bytesToHex(rawBytes);
    } else if (typeof data === 'string') {
        // 最简单的方法：直接把所有可能的换行符表示都替换成 <br>
        displayStr = data
            .replace(/\\r\\n/g, '<br>')
            .replace(/\\n\\r/g, '<br>')
            .replace(/\\r/g, '<br>')
            .replace(/\\n/g, '<br>')
            .replace(/\r\n/g, '<br>')
            .replace(/\r/g, '<br>')
            .replace(/\n/g, '<br>')
            .replace(/\t/g, '\\t');
    } else {
        displayStr = data;
    }
    
    const line = `<span class="${className}">[${timestamp}] ${prefix} ${displayStr}</span>\n`;
    dataLog.innerHTML += line;
    dataLog.scrollTop = dataLog.scrollHeight;
}

function setSendControlsEnabled(enabled) {
    sendBtn.disabled = !enabled;
    sendInput.disabled = !enabled;
    baudRateSelect.disabled = enabled;
}

function getNewline() {
    const type = newlineTypeSelect.value;
    switch (type) {
        case 'lf': return '\n';
        case 'crlf': return '\r\n';
        case 'cr': return '\r';
        default: return '';
    }
}

async function readLoop() {
    while (keepReading && port.readable) {
        try {
            reader = port.readable.getReader();
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) {
                    const data = decoder.decode(value);
                    logData(data, false, value);
                }
            }
        } catch (error) {
            console.error('读取错误:', error);
        } finally {
            reader.releaseLock();
        }
    }
}

async function connectSerial() {
    try {
        const baudRate = parseInt(baudRateSelect.value);
        
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: baudRate });
        
        keepReading = true;
        readLoop();
        
        writer = port.writable.getWriter();
        
        updateStatus(`已连接 (波特率: ${baudRate})`, true);
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        setSendControlsEnabled(true);
        logData('串口连接成功！');
        
    } catch (error) {
        console.error('连接错误:', error);
        updateStatus(`连接失败: ${error.message}`, false);
        logData(`错误: ${error.message}`);
    }
}

async function sendData() {
    if (!port || !port.writable || !writer) {
        logData('错误: 串口未连接', true);
        return;
    }
    
    const inputValue = sendInput.value.trim();
    if (!inputValue) return;
    
    let bytes;
    let displayData;
    
    try {
        if (sendModeSelect.value === 'hex') {
            bytes = hexToBytes(inputValue);
            displayData = inputValue;
        } else {
            let data = inputValue;
            data += getNewline();
            bytes = encoder.encode(data);
            displayData = data;
        }
        
        await writer.write(bytes);
        logData(displayData, true, bytes);
        sendInput.value = '';
    } catch (error) {
        console.error('发送错误:', error);
        logData(`发送失败: ${error.message}`, true);
    }
}

async function disconnectSerial() {
    keepReading = false;
    
    if (reader) {
        try {
            await reader.cancel();
        } catch (e) {}
    }
    
    if (writer) {
        try {
            await writer.close();
        } catch (e) {}
    }
    
    if (port) {
        try {
            await port.close();
        } catch (e) {}
    }
    
    updateStatus('已断开连接', false);
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    setSendControlsEnabled(false);
    logData('串口已断开');
}

function clearLog() {
    dataLog.innerHTML = '';
}

connectBtn.addEventListener('click', connectSerial);
disconnectBtn.addEventListener('click', disconnectSerial);
clearBtn.addEventListener('click', clearLog);
sendBtn.addEventListener('click', sendData);

sendInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) {
        sendData();
    }
});

if (!navigator.serial) {
    updateStatus('您的浏览器不支持 Web Serial API', false);
    logData('错误: 浏览器不支持 Web Serial API，请使用 Chrome/Edge 浏览器');
    connectBtn.disabled = true;
}
