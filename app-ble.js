let device = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let decoder = new TextDecoder('utf-8');
let encoder = new TextEncoder('utf-8');

const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const clearBtn = document.getElementById('clearBtn');
const sendBtn = document.getElementById('sendBtn');
const sendInput = document.getElementById('sendInput');
const displayModeSelect = document.getElementById('displayMode');
const sendModeSelect = document.getElementById('sendMode');
const newlineTypeSelect = document.getElementById('newlineType');
const statusDiv = document.getElementById('status');
const dataLog = document.getElementById('dataLog');

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

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
        // 直接暴力替换：把所有字面量的换行符都换成真正的换行
        displayStr = data;
        
        // 先处理所有字面量的换行符表示
        displayStr = displayStr.replace(/\\r\\n/g, '\n');
        displayStr = displayStr.replace(/\\n\\r/g, '\n');
        displayStr = displayStr.replace(/\\r/g, '\n');
        displayStr = displayStr.replace(/\\n/g, '\n');
        
        // 再处理真正的换行符
        displayStr = displayStr.replace(/\r\n/g, '\n');
        displayStr = displayStr.replace(/\r/g, '\n');
        
        // 转义制表符，但不转义换行（已经处理好了）
        displayStr = displayStr.replace(/\t/g, '\\t');
        
        // 把换行符变成 HTML 的 <br>
        displayStr = displayStr.replace(/\n/g, '<br>');
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

async function connectBluetooth() {
    try {
        updateStatus('正在搜索设备...', false);
        
        device = await navigator.bluetooth.requestDevice({
            filters: [{
                services: [UART_SERVICE_UUID]
            }],
            optionalServices: [UART_SERVICE_UUID]
        });

        updateStatus(`连接到 ${device.name}...`, false);
        
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(UART_SERVICE_UUID);
        
        rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
        txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
        
        await rxCharacteristic.startNotifications();
        rxCharacteristic.addEventListener('characteristicvaluechanged', handleData);
        
        device.addEventListener('gattserverdisconnected', onDisconnected);
        
        updateStatus(`已连接到 ${device.name}`, true);
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        setSendControlsEnabled(true);
        logData('设备连接成功！');
        
    } catch (error) {
        console.error('连接错误:', error);
        updateStatus(`连接失败: ${error.message}`, false);
        logData(`错误: ${error.message}`);
    }
}

function handleData(event) {
    const value = event.target.value;
    const bytes = new Uint8Array(value.buffer);
    const data = decoder.decode(value);
    logData(data, false, bytes);
}

async function sendData() {
    if (!txCharacteristic || !device.gatt.connected) {
        logData('错误: 设备未连接', true);
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
        
        await txCharacteristic.writeValue(bytes);
        logData(displayData, true, bytes);
        sendInput.value = '';
    } catch (error) {
        console.error('发送错误:', error);
        logData(`发送失败: ${error.message}`, true);
    }
}

function onDisconnected() {
    updateStatus('设备已断开连接', false);
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    setSendControlsEnabled(false);
    logData('设备已断开连接');
}

function disconnectBluetooth() {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
}

function clearLog() {
    dataLog.innerHTML = '';
}

connectBtn.addEventListener('click', connectBluetooth);
disconnectBtn.addEventListener('click', disconnectBluetooth);
clearBtn.addEventListener('click', clearLog);
sendBtn.addEventListener('click', sendData);

sendInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !sendBtn.disabled) {
        sendData();
    }
});

if (!navigator.bluetooth) {
    updateStatus('您的浏览器不支持 Web Bluetooth API', false);
    logData('错误: 浏览器不支持 Web Bluetooth API，请使用 Chrome/Edge 浏览器');
    connectBtn.disabled = true;
}
