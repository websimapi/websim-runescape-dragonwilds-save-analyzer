document.addEventListener('DOMContentLoaded', () => {
    // Tab functionality
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Add active class to current button and pane
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // File upload functionality
    const fileInput = document.getElementById('file-input');
    const uploadZone = document.querySelector('.upload-zone');
    const fileInfo = document.getElementById('file-info');
    
    // Handle drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, () => {
            uploadZone.classList.remove('dragover');
        }, false);
    });
    
    uploadZone.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            fileInput.files = files;
            handleFiles(files);
        }
    }
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
    
    // Global variables to store save file data
    let saveFileData = null;
    let saveFileArrayBuffer = null;
    let saveFileStructure = null;
    
    // Handle files
    function handleFiles(files) {
        if (files.length === 0) return;
        
        const file = files[0];
        if (!file.name.endsWith('.sav')) {
            fileInfo.innerHTML = '<p class="error">Error: Please select a .sav file</p>';
            return;
        }
        
        fileInfo.innerHTML = `<p>File: ${file.name}</p><p>Size: ${formatFileSize(file.size)}</p><p>Last Modified: ${new Date(file.lastModified).toLocaleString()}</p>`;
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            saveFileArrayBuffer = e.target.result;
            saveFileData = new Uint8Array(saveFileArrayBuffer);
            
            // Try to detect the save file structure
            detectSaveFileStructure(saveFileData);
            
            // Show the analyze tab after successful upload
            document.querySelector('[data-tab="analyze"]').click();
            analyzeSaveFile(saveFileData);
        };
        
        reader.onerror = function() {
            fileInfo.innerHTML = '<p class="error">Error: Failed to read file</p>';
        };
        
        reader.readAsArrayBuffer(file);
    }
    
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    
    // Detect save file structure
    function detectSaveFileStructure(data) {
        // Initialize an empty structure object
        saveFileStructure = {
            signature: {
                offset: 0,
                length: 4,
                value: ''
            },
            version: {
                offset: null,
                length: null,
                value: ''
            },
            timestamp: {
                offset: null,
                length: null,
                value: ''
            },
            worldName: {
                offset: null,
                length: null,
                value: ''
            },
            worldMapName: {
                offset: null,
                length: null,
                value: ''
            },
            friendlyFire: {
                offset: null,
                value: null
            },
            sessionPrivacy: {
                offset: null,
                value: null
            },
            sessionPassword: {
                offset: null,
                length: null,
                value: ''
            },
            worldOwnerId: {
                offset: null,
                length: null,
                value: ''
            }
        };
        
        try {
            // Check for SAVE signature
            const signature = new TextDecoder().decode(data.slice(0, 4));
            saveFileStructure.signature.value = signature;
            
            if (signature !== 'SAVE') {
                console.warn('File does not start with SAVE signature, may not be a valid save file');
            }
            
            // Search for VERSION string
            let versionOffset = searchForPattern(data, 'VERSION');
            if (versionOffset !== -1) {
                // Found VERSION marker, now extract the version string
                saveFileStructure.version.offset = versionOffset;
                
                // Extract version data, assuming fixed length or null-terminated
                let versionLength = 0;
                for (let i = versionOffset + 8; i < versionOffset + 30; i++) {
                    if (data[i] === 0) {
                        versionLength = i - (versionOffset + 8);
                        break;
                    }
                }
                
                if (versionLength > 0) {
                    saveFileStructure.version.length = versionLength;
                    const versionData = data.slice(versionOffset + 8, versionOffset + 8 + versionLength);
                    saveFileStructure.version.value = new TextDecoder().decode(versionData);
                }
            }
            
            // Search for a timestamp-like pattern (2025-05-12T02:11:41)
            // Look for T followed by : pattern which is common in ISO timestamps
            let timestampOffset = -1;
            for (let i = 0; i < data.length - 10; i++) {
                if (data[i] === 84 && // T
                    data[i + 3] === 58) { // :
                    // Look back to see if we have a likely timestamp
                    let possibleStart = Math.max(0, i - 10);
                    let sample = new TextDecoder().decode(data.slice(possibleStart, i + 10));
                    if (/\d{4}-\d{2}-\d{2}T/.test(sample)) {
                        timestampOffset = possibleStart;
                        break;
                    }
                }
            }
            
            if (timestampOffset !== -1) {
                // Found a timestamp-like pattern
                saveFileStructure.timestamp.offset = timestampOffset;
                
                // Estimate the length (ISO timestamps are typically around 24 chars)
                let timestampEnd = timestampOffset + 30;
                for (let i = timestampOffset; i < timestampOffset + 30; i++) {
                    if (data[i] === 0 || data[i] === 32) { // null byte or space
                        timestampEnd = i;
                        break;
                    }
                }
                
                saveFileStructure.timestamp.length = timestampEnd - timestampOffset;
                const timestampData = data.slice(timestampOffset, timestampEnd);
                saveFileStructure.timestamp.value = new TextDecoder().decode(timestampData);
            }
            
            // Search for WorldName marker
            const worldNameMarker = 'WorldName';
            let worldNameMarkerOffset = searchForPattern(data, worldNameMarker);
            
            if (worldNameMarkerOffset !== -1) {
                // Found WorldName marker, now detect the actual world name value
                // Assuming the world name starts after the marker and some padding
                const worldNameStart = worldNameMarkerOffset + worldNameMarker.length + 1;
                saveFileStructure.worldName.offset = worldNameStart;
                
                // Find the end of the world name (null byte or next marker)
                let worldNameEnd = worldNameStart;
                for (let i = worldNameStart; i < worldNameStart + 50; i++) {
                    if (data[i] === 0 || data[i] === 10) { // null byte or line feed
                        worldNameEnd = i;
                        break;
                    }
                }
                
                saveFileStructure.worldName.length = worldNameEnd - worldNameStart;
                if (saveFileStructure.worldName.length > 0) {
                    const worldNameData = data.slice(worldNameStart, worldNameEnd);
                    saveFileStructure.worldName.value = new TextDecoder().decode(worldNameData).trim();
                }
                
                // Search for WorldMapName marker
                const worldMapMarker = 'WorldMapName';
                let worldMapMarkerOffset = searchForPattern(data, worldMapMarker);
                
                if (worldMapMarkerOffset !== -1) {
                    // Found WorldMapName marker
                    const worldMapStart = worldMapMarkerOffset + worldMapMarker.length + 1;
                    saveFileStructure.worldMapName.offset = worldMapStart;
                    
                    // Find the end of the world map name
                    let worldMapEnd = worldMapStart;
                    for (let i = worldMapStart; i < worldMapStart + 50; i++) {
                        if (data[i] === 0 || data[i] === 10) { // null byte or line feed
                            worldMapEnd = i;
                            break;
                        }
                    }
                    
                    saveFileStructure.worldMapName.length = worldMapEnd - worldMapStart;
                    if (saveFileStructure.worldMapName.length > 0) {
                        const worldMapData = data.slice(worldMapStart, worldMapEnd);
                        saveFileStructure.worldMapName.value = new TextDecoder().decode(worldMapData).trim();
                    }
                    
                    // Search for FriendlyFire marker
                    const friendlyFireMarker = 'FriendlyFire';
                    let friendlyFireOffset = searchForPattern(data, friendlyFireMarker);
                    
                    if (friendlyFireOffset !== -1) {
                        // Found FriendlyFire marker, value is likely a byte after the marker
                        saveFileStructure.friendlyFire.offset = friendlyFireOffset + friendlyFireMarker.length + 1;
                        saveFileStructure.friendlyFire.value = data[saveFileStructure.friendlyFire.offset];
                    }
                    
                    // Search for SessionPrivacy marker
                    const sessionPrivacyMarker = 'SessionPrivacy';
                    let sessionPrivacyOffset = searchForPattern(data, sessionPrivacyMarker);
                    
                    if (sessionPrivacyOffset !== -1) {
                        // Found SessionPrivacy marker
                        saveFileStructure.sessionPrivacy.offset = sessionPrivacyOffset + sessionPrivacyMarker.length + 1;
                        saveFileStructure.sessionPrivacy.value = data[saveFileStructure.sessionPrivacy.offset];
                        
                        // Search for SessionPasswd marker
                        const sessionPasswdMarker = 'SessionPasswd';
                        let sessionPasswdOffset = searchForPattern(data, sessionPasswdMarker);
                        
                        if (sessionPasswdOffset !== -1) {
                            // Found SessionPasswd marker
                            const sessionPasswdStart = sessionPasswdOffset + sessionPasswdMarker.length + 1;
                            saveFileStructure.sessionPassword.offset = sessionPasswdStart;
                            
                            // Find the end of the password
                            let sessionPasswdEnd = sessionPasswdStart;
                            for (let i = sessionPasswdStart; i < sessionPasswdStart + 50; i++) {
                                if (data[i] === 0 || data[i] === 10) { // null byte or line feed
                                    sessionPasswdEnd = i;
                                    break;
                                }
                            }
                            
                            saveFileStructure.sessionPassword.length = sessionPasswdEnd - sessionPasswdStart;
                            if (saveFileStructure.sessionPassword.length > 0) {
                                const passwordData = data.slice(sessionPasswdStart, sessionPasswdEnd);
                                saveFileStructure.sessionPassword.value = new TextDecoder().decode(passwordData).trim();
                            }
                        }
                    }
                }
            }
            
            console.log('Detected save file structure:', saveFileStructure);
            
        } catch (error) {
            console.error('Error detecting save file structure:', error);
        }
    }
    
    // Helper function to search for text pattern in binary data
    function searchForPattern(data, pattern) {
        const patternBytes = new TextEncoder().encode(pattern);
        const patternLength = patternBytes.length;
        
        for (let i = 0; i <= data.length - patternLength; i++) {
            let match = true;
            for (let j = 0; j < patternLength; j++) {
                if (data[i + j] !== patternBytes[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return i;
            }
        }
        
        return -1; // Pattern not found
    }
    
    // Analyze save file
    function analyzeSaveFile(data) {
        // Display header information
        const headerInfo = document.getElementById('header-info');
        const worldInfo = document.getElementById('world-info');
        const playerData = document.getElementById('player-data');
        const hexView = document.getElementById('hex-view');
        const textView = document.getElementById('text-view');
        const editFields = document.getElementById('edit-fields');
        
        try {
            // Check if we have a detected structure
            if (!saveFileStructure) {
                detectSaveFileStructure(data);
            }
            
            // Display header information using detected structure
            let headerHtml = '<table class="data-table">';
            headerHtml += '<tr><th>Offset</th><th>Description</th><th>Value</th></tr>';
            
            // Signature
            headerHtml += `<tr><td>0x${saveFileStructure.signature.offset.toString(16).padStart(2, '0')}</td><td>Signature</td><td>${saveFileStructure.signature.value}</td></tr>`;
            
            // Version
            if (saveFileStructure.version.offset !== null) {
                headerHtml += `<tr><td>0x${saveFileStructure.version.offset.toString(16).padStart(2, '0')}</td><td>Version</td><td>${saveFileStructure.version.value}</td></tr>`;
            }
            
            // Timestamp
            if (saveFileStructure.timestamp.offset !== null) {
                headerHtml += `<tr><td>0x${saveFileStructure.timestamp.offset.toString(16).padStart(2, '0')}</td><td>Timestamp</td><td>${saveFileStructure.timestamp.value}</td></tr>`;
            }
            
            headerHtml += '</table>';
            headerInfo.innerHTML = headerHtml;
            
            // Display world information
            let worldInfoHtml = '<table class="data-table">';
            worldInfoHtml += '<tr><th>Setting</th><th>Value</th><th>Offset</th></tr>';
            
            // World Name
            if (saveFileStructure.worldName.offset !== null) {
                worldInfoHtml += `<tr><td>World Name</td><td>${saveFileStructure.worldName.value || 'Not set'}</td><td>0x${saveFileStructure.worldName.offset.toString(16).padStart(2, '0')}</td></tr>`;
            } else {
                worldInfoHtml += `<tr><td>World Name</td><td>Unknown</td><td>-</td></tr>`;
            }
            
            // World Map
            if (saveFileStructure.worldMapName.offset !== null) {
                worldInfoHtml += `<tr><td>World Map</td><td>${saveFileStructure.worldMapName.value || 'Not set'}</td><td>0x${saveFileStructure.worldMapName.offset.toString(16).padStart(2, '0')}</td></tr>`;
            } else {
                worldInfoHtml += `<tr><td>World Map</td><td>Unknown</td><td>-</td></tr>`;
            }
            
            // Friendly Fire
            if (saveFileStructure.friendlyFire.offset !== null) {
                const friendlyFireValue = saveFileStructure.friendlyFire.value === 0 ? 'Off' : 
                                          saveFileStructure.friendlyFire.value === 1 ? 'On' : 'Unknown';
                worldInfoHtml += `<tr><td>Friendly Fire</td><td>${friendlyFireValue}</td><td>0x${saveFileStructure.friendlyFire.offset.toString(16).padStart(2, '0')}</td></tr>`;
            } else {
                worldInfoHtml += `<tr><td>Friendly Fire</td><td>Unknown</td><td>-</td></tr>`;
            }
            
            // Session Privacy
            if (saveFileStructure.sessionPrivacy.offset !== null) {
                const privacyValue = saveFileStructure.sessionPrivacy.value === 0 ? 'Public' : 
                                     saveFileStructure.sessionPrivacy.value === 1 ? 'Friends Only' :
                                     saveFileStructure.sessionPrivacy.value === 2 ? 'Private' : 'Unknown';
                worldInfoHtml += `<tr><td>Session Privacy</td><td>${privacyValue}</td><td>0x${saveFileStructure.sessionPrivacy.offset.toString(16).padStart(2, '0')}</td></tr>`;
            }
            
            // Session Password
            if (saveFileStructure.sessionPassword.offset !== null) {
                worldInfoHtml += `<tr><td>Session Password</td><td>${saveFileStructure.sessionPassword.value || 'Not set'}</td><td>0x${saveFileStructure.sessionPassword.offset.toString(16).padStart(2, '0')}</td></tr>`;
            }
            
            worldInfoHtml += '</table>';
            worldInfo.innerHTML = worldInfoHtml;
            
            // Player data section
            playerData.innerHTML = '<p>Advanced player data parsing requires more specific knowledge of the save file format.</p>';
            
            // Create hex view
            let hexDump = '';
            let textDump = '';
            const bytesPerLine = 16;
            
            for (let i = 0; i < Math.min(data.length, 1000); i += bytesPerLine) {
                hexDump += `${i.toString(16).padStart(8, '0')}: `;
                
                for (let j = 0; j < bytesPerLine; j++) {
                    if (i + j < data.length) {
                        hexDump += data[i + j].toString(16).padStart(2, '0') + ' ';
                    } else {
                        hexDump += '   ';
                    }
                }
                
                hexDump += '  ';
                
                for (let j = 0; j < bytesPerLine; j++) {
                    if (i + j < data.length) {
                        const byte = data[i + j];
                        hexDump += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                    }
                }
                
                hexDump += '\n';
            }
            
            hexView.textContent = hexDump;
            
            // Create an ASCII text view (for strings)
            for (let i = 0; i < Math.min(data.length, 1000); i++) {
                const byte = data[i];
                textDump += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
            }
            
            textView.textContent = textDump;
            
            // Populate edit fields using detected structure
            let editHtml = '';
            
            // Add world name edit field
            if (saveFileStructure.worldName.offset !== null) {
                editHtml += `
                <div class="edit-field">
                    <label for="edit-world-name">World Name:</label>
                    <input type="text" id="edit-world-name" value="${saveFileStructure.worldName.value || ''}">
                </div>
                `;
            }
            
            // Add world map edit field
            if (saveFileStructure.worldMapName.offset !== null) {
                editHtml += `
                <div class="edit-field">
                    <label for="edit-world-map">World Map:</label>
                    <input type="text" id="edit-world-map" value="${saveFileStructure.worldMapName.value || ''}">
                </div>
                `;
            }
            
            // Add friendly fire toggle
            if (saveFileStructure.friendlyFire.offset !== null) {
                editHtml += `
                <div class="edit-field">
                    <label for="edit-friendly-fire">Friendly Fire:</label>
                    <select id="edit-friendly-fire">
                        <option value="0" ${saveFileStructure.friendlyFire.value === 0 ? 'selected' : ''}>Off</option>
                        <option value="1" ${saveFileStructure.friendlyFire.value === 1 ? 'selected' : ''}>On</option>
                    </select>
                </div>
                `;
            }
            
            // Add session privacy field
            if (saveFileStructure.sessionPrivacy.offset !== null) {
                editHtml += `
                <div class="edit-field">
                    <label for="edit-session-privacy">Session Privacy:</label>
                    <select id="edit-session-privacy">
                        <option value="0" ${saveFileStructure.sessionPrivacy.value === 0 ? 'selected' : ''}>Public</option>
                        <option value="1" ${saveFileStructure.sessionPrivacy.value === 1 ? 'selected' : ''}>Friends Only</option>
                        <option value="2" ${saveFileStructure.sessionPrivacy.value === 2 ? 'selected' : ''}>Private</option>
                    </select>
                </div>
                `;
            }
            
            // Add session password field
            if (saveFileStructure.sessionPassword.offset !== null) {
                editHtml += `
                <div class="edit-field">
                    <label for="edit-session-password">Session Password:</label>
                    <input type="text" id="edit-session-password" value="${saveFileStructure.sessionPassword.value || ''}">
                </div>
                `;
            }
            
            editFields.innerHTML = editHtml;
            
        } catch (error) {
            console.error('Error analyzing save file:', error);
            headerInfo.innerHTML = `<p class="error">Error analyzing save file: ${error.message}</p>`;
        }
    }
    
    // Handle save changes
    const saveChangesBtn = document.getElementById('save-changes');
    const downloadLink = document.getElementById('download-link');
    
    saveChangesBtn.addEventListener('click', () => {
        if (!saveFileData || !saveFileStructure) {
            alert('No save file loaded or structure not detected');
            return;
        }
        
        try {
            // Create a copy of the save file data
            const modifiedData = new Uint8Array(saveFileArrayBuffer.slice(0));
            
            // Apply changes using detected structure
            
            // World Name
            if (saveFileStructure.worldName.offset !== null && saveFileStructure.worldName.length !== null) {
                const worldName = document.getElementById('edit-world-name').value;
                writeString(modifiedData, saveFileStructure.worldName.offset, worldName, saveFileStructure.worldName.length);
            }
            
            // World Map
            if (saveFileStructure.worldMapName.offset !== null && saveFileStructure.worldMapName.length !== null) {
                const worldMap = document.getElementById('edit-world-map').value;
                writeString(modifiedData, saveFileStructure.worldMapName.offset, worldMap, saveFileStructure.worldMapName.length);
            }
            
            // Friendly Fire
            if (saveFileStructure.friendlyFire.offset !== null) {
                const friendlyFire = document.getElementById('edit-friendly-fire').value;
                modifiedData[saveFileStructure.friendlyFire.offset] = parseInt(friendlyFire);
            }
            
            // Session Privacy
            if (saveFileStructure.sessionPrivacy.offset !== null) {
                const sessionPrivacy = document.getElementById('edit-session-privacy').value;
                modifiedData[saveFileStructure.sessionPrivacy.offset] = parseInt(sessionPrivacy);
            }
            
            // Session Password
            if (saveFileStructure.sessionPassword.offset !== null && saveFileStructure.sessionPassword.length !== null) {
                const sessionPassword = document.getElementById('edit-session-password').value;
                writeString(modifiedData, saveFileStructure.sessionPassword.offset, sessionPassword, saveFileStructure.sessionPassword.length);
            }
            
            // Create a Blob from the modified data
            const blob = new Blob([modifiedData], { type: 'application/octet-stream' });
            
            // Update download link
            const url = URL.createObjectURL(blob);
            downloadLink.href = url;
            
            // Show success message
            const successMessage = document.createElement('div');
            successMessage.className = 'save-success';
            successMessage.textContent = 'Changes applied successfully. Download the modified file.';
            successMessage.style.display = 'block';
            
            // Remove any existing success messages
            const existingMessages = document.querySelectorAll('.save-success');
            existingMessages.forEach(msg => msg.remove());
            
            document.querySelector('.edit-container').appendChild(successMessage);
            
        } catch (error) {
            console.error('Error modifying save file:', error);
            alert(`Error modifying save file: ${error.message}`);
        }
    });
    
    // Helper function to write string to buffer
    function writeString(buffer, offset, string, maxLength) {
        // Clear the existing data
        for (let i = 0; i < maxLength; i++) {
            buffer[offset + i] = 0;
        }
        
        // Write the new string
        const encoder = new TextEncoder();
        const encoded = encoder.encode(string);
        const bytesToWrite = Math.min(encoded.length, maxLength);
        
        for (let i = 0; i < bytesToWrite; i++) {
            buffer[offset + i] = encoded[i];
        }
    }
});