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
            infoMarker: {
                offset: null,
                length: null,
                value: ''
            },
            timestamp: {
                offset: null,
                length: null,
                value: ''
            },
            version: {
                offset: null,
                length: null,
                value: ''
            },
            guid: {
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
            },
            worldNameOwner: {
                offset: null,
                length: null,
                value: ''
            },
            playerData: [],
            objectData: [],
            sections: []
        };
        
        try {
            // Check for SAVE signature
            const signature = new TextDecoder().decode(data.slice(0, 4));
            saveFileStructure.signature.value = signature;
            
            if (signature !== 'SAVE') {
                console.warn('File does not start with SAVE signature, may not be a valid save file');
            }
            
            // Look for INFO marker (µ INFOˆ) - these are special characters in the format
            let infoOffset = -1;
            for (let i = 4; i < Math.min(20, data.length); i++) {
                // Check for characters that might be part of the INFO marker pattern
                if (data[i] === 181 || data[i] === 194) { // µ or similar special character
                    // Check if the following bytes might contain "INFO"
                    const possibleInfo = new TextDecoder().decode(data.slice(i, i + 10)).replace(/[^a-zA-Z]/g, '');
                    if (possibleInfo.includes('INFO')) {
                        infoOffset = i;
                        break;
                    }
                }
            }
            
            if (infoOffset !== -1) {
                saveFileStructure.infoMarker.offset = infoOffset;
                saveFileStructure.infoMarker.length = 10; // Approximate length of marker
                saveFileStructure.infoMarker.value = new TextDecoder().decode(data.slice(infoOffset, infoOffset + 10));
            }
            
            // Search for a timestamp-like pattern (2025-05-12T02:11:41)
            let timestampOffset = -1;
            for (let i = 0; i < 100; i++) {
                if (data[i] === 50 && data[i+1] === 48 && data[i+2] === 50 && // "202" - start of 202x year
                    data[i+4] === 45) { // "-" in date format
                    // Found a likely date pattern
                    timestampOffset = i;
                    break;
                }
            }
            
            if (timestampOffset !== -1) {
                // Found a timestamp-like pattern
                saveFileStructure.timestamp.offset = timestampOffset;
                
                // Find the end of the timestamp
                let timestampEnd = timestampOffset;
                for (let i = timestampOffset; i < timestampOffset + 40; i++) {
                    if (data[i] === 90) { // 'Z' at the end of ISO format
                        timestampEnd = i + 1;
                        break;
                    }
                }
                
                saveFileStructure.timestamp.length = timestampEnd - timestampOffset;
                const timestampData = data.slice(timestampOffset, timestampEnd);
                saveFileStructure.timestamp.value = new TextDecoder().decode(timestampData);
            }
            
            // Look for the CINF or similar section marker after timestamp
            let cinfOffset = -1;
            if (timestampOffset !== -1) {
                for (let i = timestampOffset + 25; i < timestampOffset + 40; i++) {
                    // Check for 'C' followed by 'I' or 'N' or similar pattern
                    if (data[i] === 67 && (data[i+1] === 73 || data[i+1] === 78)) {
                        const section = new TextDecoder().decode(data.slice(i, i + 10)).replace(/[^a-zA-Z]/g, '');
                        if (section.includes('CINF') || section.includes('CINFX')) {
                            cinfOffset = i;
                            break;
                        }
                    }
                }
            }
            
            // Parse version and other section data following the structure markers
            if (cinfOffset !== -1) {
                saveFileStructure.sections.push({
                    name: 'CINF',
                    offset: cinfOffset,
                    length: 10 // Estimated
                });
                
                // VERSION typically appears after CINF marker
                const versionMarker = 'VERSION';
                let versionOffset = searchForPattern(data, versionMarker, cinfOffset, cinfOffset + 200);
                
                if (versionOffset !== -1) {
                    saveFileStructure.version.offset = versionOffset;
                    saveFileStructure.version.length = versionMarker.length;
                    saveFileStructure.version.value = 'Found at offset ' + versionOffset;
                }
                
                // Look for GUIDs that typically follow VERSION
                const guidMarkers = ['GUID_A', 'GUID_B', 'GUID_C', 'GUID_D'];
                for (let i = 0; i < guidMarkers.length; i++) {
                    const guidOffset = searchForPattern(data, guidMarkers[i], versionOffset, versionOffset + 300);
                    if (guidOffset !== -1) {
                        if (!saveFileStructure.guid.offset) {
                            saveFileStructure.guid.offset = guidOffset;
                        }
                    }
                }
            }
            
            // Search for WorldName marker
            const worldNameMarker = 'WorldName';
            let worldNameMarkerOffset = searchForPattern(data, worldNameMarker);
            
            if (worldNameMarkerOffset !== -1) {
                // Found WorldName marker, now find the actual world name value
                // In the sample file this appears near byte ~140-150
                saveFileStructure.worldName.offset = worldNameMarkerOffset;
                
                // Look for actual world name after owner markers
                const worldNameOwnerMarker = 'WorldNameOwner';
                let worldNameOwnerOffset = searchForPattern(data, worldNameOwnerMarker);
                
                if (worldNameOwnerOffset !== -1) {
                    saveFileStructure.worldNameOwner.offset = worldNameOwnerOffset;
                    
                    // The actual world name appears after these markers
                    // Look for a 'typical' looking string 20-50 bytes ahead
                    for (let i = worldNameOwnerOffset + 20; i < worldNameOwnerOffset + 100; i++) {
                        // Look for strings like "Centural", which should be non-zero printable ASCII
                        if (data[i] > 32 && data[i] < 127) {
                            // Find the start of a continuous string
                            let stringStart = i;
                            while (stringStart > worldNameOwnerOffset && data[stringStart-1] > 32 && data[stringStart-1] < 127) {
                                stringStart--;
                            }
                            
                            // Find the end of the string
                            let stringEnd = stringStart;
                            while (stringEnd < data.length && data[stringEnd] > 32 && data[stringEnd] < 127) {
                                stringEnd++;
                            }
                            
                            if (stringEnd - stringStart >= 3) { // At least 3 chars to be a valid name
                                const worldNameCandidate = new TextDecoder().decode(data.slice(stringStart, stringEnd));
                                saveFileStructure.worldName.value = worldNameCandidate;
                                saveFileStructure.worldName.length = stringEnd - stringStart;
                                // This is our best guess for the world name
                                break;
                            }
                        }
                    }
                }
                
                // Find WorldMapName
                const worldMapMarker = 'WorldMapName';
                let worldMapMarkerOffset = searchForPattern(data, worldMapMarker);
                
                if (worldMapMarkerOffset !== -1) {
                    saveFileStructure.worldMapName.offset = worldMapMarkerOffset;
                    
                    // The structure is similar - look for data after markers
                    for (let i = worldMapMarkerOffset + 15; i < worldMapMarkerOffset + 70; i++) {
                        if (data[i] > 32 && data[i] < 127) {
                            let stringStart = i;
                            while (stringStart > worldMapMarkerOffset && data[stringStart-1] > 32 && data[stringStart-1] < 127) {
                                stringStart--;
                            }
                            
                            let stringEnd = stringStart;
                            while (stringEnd < data.length && data[stringEnd] > 32 && data[stringEnd] < 127) {
                                stringEnd++;
                            }
                            
                            if (stringEnd - stringStart >= 2) { // Valid name length
                                const mapName = new TextDecoder().decode(data.slice(stringStart, stringEnd));
                                saveFileStructure.worldMapName.value = mapName;
                                saveFileStructure.worldMapName.length = stringEnd - stringStart;
                                break;
                            }
                        }
                    }
                }
                
                // Find FriendlyFire setting
                const friendlyFireMarker = 'FriendlyFire';
                let friendlyFireOffset = searchForPattern(data, friendlyFireMarker);
                
                if (friendlyFireOffset !== -1) {
                    // Found FriendlyFire marker, value is nearby
                    saveFileStructure.friendlyFire.offset = friendlyFireOffset;
                    
                    // Look for a single byte value within a reasonable range from the marker
                    for (let i = friendlyFireOffset + friendlyFireMarker.length; i < friendlyFireOffset + 30; i++) {
                        // Typical boolean values are 0 or 1
                        if (data[i] === 0 || data[i] === 1) {
                            saveFileStructure.friendlyFire.value = data[i];
                            break;
                        }
                    }
                }
                
                // Find SessionPrivacy
                const sessionPrivacyMarker = 'SessionPrivacy';
                let sessionPrivacyOffset = searchForPattern(data, sessionPrivacyMarker);
                
                if (sessionPrivacyOffset !== -1) {
                    saveFileStructure.sessionPrivacy.offset = sessionPrivacyOffset;
                    
                    // Similar approach to find the value
                    for (let i = sessionPrivacyOffset + sessionPrivacyMarker.length; i < sessionPrivacyOffset + 30; i++) {
                        if (data[i] >= 0 && data[i] <= 2) { // Privacy is usually 0, 1, or 2
                            saveFileStructure.sessionPrivacy.value = data[i];
                            break;
                        }
                    }
                }
                
                // Find owner ID
                const worldOwnerIdMarker = 'WorldOwnerId';
                let worldOwnerIdOffset = searchForPattern(data, worldOwnerIdMarker);
                
                if (worldOwnerIdOffset !== -1) {
                    saveFileStructure.worldOwnerId.offset = worldOwnerIdOffset;
                    
                    // Find the owner name
                    for (let i = worldOwnerIdOffset + 15; i < worldOwnerIdOffset + 50; i++) {
                        if (data[i] > 32 && data[i] < 127) {
                            let stringStart = i;
                            while (stringStart > worldOwnerIdOffset && data[stringStart-1] > 32 && data[stringStart-1] < 127) {
                                stringStart--;
                            }
                            
                            let stringEnd = stringStart;
                            while (stringEnd < data.length && data[stringEnd] > 32 && data[stringEnd] < 127) {
                                stringEnd++;
                            }
                            
                            if (stringEnd - stringStart >= 3) { // Valid name length
                                const ownerId = new TextDecoder().decode(data.slice(stringStart, stringEnd));
                                saveFileStructure.worldOwnerId.value = ownerId;
                                saveFileStructure.worldOwnerId.length = stringEnd - stringStart;
                                break;
                            }
                        }
                    }
                }
            }
            
            // Try to identify other key sections like GLOB, LVLS, LEVL, etc.
            const keyMarkers = ['GLOB[', 'LVLS', 'LEVL', 'META', 'NOBJ', 'PROP', 'SPWN'];
            let lastPosition = 0;
            
            for (const marker of keyMarkers) {
                let position = 0;
                while ((position = searchForPattern(data, marker, lastPosition)) !== -1) {
                    saveFileStructure.sections.push({
                        name: marker,
                        offset: position,
                        length: marker.length
                    });
                    lastPosition = position + marker.length + 1;
                }
            }
            
            // Identify player data after the markers - this would be more complex
            // For simplicity, we'll just identify possible player-related sections
            const playerRelatedMarkers = ['Bonesdog', 'PROP'];
            for (const marker of playerRelatedMarkers) {
                let position = 0;
                while ((position = searchForPattern(data, marker, lastPosition)) !== -1) {
                    saveFileStructure.playerData.push({
                        marker: marker,
                        offset: position,
                        value: new TextDecoder().decode(data.slice(position, position + 50)).replace(/[^\x20-\x7E]/g, '.')
                    });
                    lastPosition = position + marker.length + 1;
                }
            }
            
            console.log('Detected save file structure:', saveFileStructure);
            
        } catch (error) {
            console.error('Error detecting save file structure:', error);
        }
    }
    
    // Helper function to search for text pattern in binary data with bounds
    function searchForPattern(data, pattern, startPos = 0, endPos = data.length) {
        const patternBytes = new TextEncoder().encode(pattern);
        const patternLength = patternBytes.length;
        const searchEndPos = Math.min(endPos, data.length);
        
        for (let i = startPos; i <= searchEndPos - patternLength; i++) {
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
            
            // INFO marker
            if (saveFileStructure.infoMarker.offset !== null) {
                headerHtml += `<tr><td>0x${saveFileStructure.infoMarker.offset.toString(16).padStart(2, '0')}</td><td>INFO Marker</td><td>${escapeHtml(saveFileStructure.infoMarker.value)}</td></tr>`;
            }
            
            // Timestamp
            if (saveFileStructure.timestamp.offset !== null) {
                headerHtml += `<tr><td>0x${saveFileStructure.timestamp.offset.toString(16).padStart(2, '0')}</td><td>Timestamp</td><td>${saveFileStructure.timestamp.value}</td></tr>`;
            }
            
            // Key sections
            for (const section of saveFileStructure.sections) {
                headerHtml += `<tr><td>0x${section.offset.toString(16).padStart(2, '0')}</td><td>Section</td><td>${section.name}</td></tr>`;
            }
            
            headerHtml += '</table>';
            headerInfo.innerHTML = headerHtml;
            
            // Display world information
            let worldInfoHtml = '<table class="data-table">';
            worldInfoHtml += '<tr><th>Setting</th><th>Value</th><th>Offset</th></tr>';
            
            // World Name
            if (saveFileStructure.worldName.value) {
                worldInfoHtml += `<tr><td>World Name</td><td>${saveFileStructure.worldName.value || 'Not set'}</td><td>0x${saveFileStructure.worldName.offset?.toString(16).padStart(2, '0') || '-'}</td></tr>`;
            } else {
                worldInfoHtml += `<tr><td>World Name</td><td>Unknown</td><td>-</td></tr>`;
            }
            
            // World Map
            if (saveFileStructure.worldMapName.value) {
                worldInfoHtml += `<tr><td>World Map</td><td>${saveFileStructure.worldMapName.value || 'Not set'}</td><td>0x${saveFileStructure.worldMapName.offset?.toString(16).padStart(2, '0') || '-'}</td></tr>`;
            } else {
                worldInfoHtml += `<tr><td>World Map</td><td>Unknown</td><td>-</td></tr>`;
            }
            
            // World Owner ID
            if (saveFileStructure.worldOwnerId.value) {
                worldInfoHtml += `<tr><td>World Owner ID</td><td>${saveFileStructure.worldOwnerId.value || 'Not set'}</td><td>0x${saveFileStructure.worldOwnerId.offset?.toString(16).padStart(2, '0') || '-'}</td></tr>`;
            }
            
            // World Owner Name
            if (saveFileStructure.worldNameOwner.value) {
                worldInfoHtml += `<tr><td>World Owner Name</td><td>${saveFileStructure.worldNameOwner.value || 'Not set'}</td><td>0x${saveFileStructure.worldNameOwner.offset?.toString(16).padStart(2, '0') || '-'}</td></tr>`;
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
            
            worldInfoHtml += '</table>';
            worldInfo.innerHTML = worldInfoHtml;
            
            // Player data section
            let playerDataHtml = '';
            
            if (saveFileStructure.playerData.length > 0) {
                playerDataHtml = '<table class="data-table">';
                playerDataHtml += '<tr><th>Offset</th><th>Marker</th><th>Data</th></tr>';
                
                for (const entry of saveFileStructure.playerData) {
                    playerDataHtml += `<tr><td>0x${entry.offset.toString(16).padStart(2, '0')}</td><td>${entry.marker}</td><td>${entry.value}</td></tr>`;
                }
                
                playerDataHtml += '</table>';
            } else {
                playerDataHtml = '<p>Advanced player data parsing requires more specific knowledge of the save file format.</p>';
            }
            
            playerData.innerHTML = playerDataHtml;
            
            // Create hex view
            let hexDump = '';
            let textDump = '';
            const bytesPerLine = 16;
            
            // Show more data for better analysis
            const displayBytes = Math.min(data.length, 2000);
            
            for (let i = 0; i < displayBytes; i += bytesPerLine) {
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
            for (let i = 0; i < displayBytes; i++) {
                const byte = data[i];
                textDump += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
            }
            
            textView.textContent = textDump;
            
            // Populate edit fields using detected structure
            let editHtml = '';
            
            // Add world name edit field
            if (saveFileStructure.worldName.offset !== null || saveFileStructure.worldName.value) {
                editHtml += `
                <div class="edit-field">
                    <label for="edit-world-name">World Name:</label>
                    <input type="text" id="edit-world-name" value="${saveFileStructure.worldName.value || ''}">
                </div>
                `;
            }
            
            // Add world map edit field
            if (saveFileStructure.worldMapName.offset !== null || saveFileStructure.worldMapName.value) {
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
            
            // Add world owner fields if found
            if (saveFileStructure.worldOwnerId.value) {
                editHtml += `
                <div class="edit-field">
                    <label for="edit-world-owner-id">World Owner ID:</label>
                    <input type="text" id="edit-world-owner-id" value="${saveFileStructure.worldOwnerId.value || ''}">
                </div>
                `;
            }
            
            editFields.innerHTML = editHtml;
            
        } catch (error) {
            console.error('Error analyzing save file:', error);
            headerInfo.innerHTML = `<p class="error">Error analyzing save file: ${error.message}</p>`;
        }
    }
    
    // Helper function to escape HTML special characters
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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
            if (saveFileStructure.worldName.offset !== null && saveFileStructure.worldName.length !== null && saveFileStructure.worldName.value) {
                const worldName = document.getElementById('edit-world-name').value;
                writeString(modifiedData, saveFileStructure.worldName.offset, worldName, saveFileStructure.worldName.length);
            }
            
            // World Map
            if (saveFileStructure.worldMapName.offset !== null && saveFileStructure.worldMapName.length !== null && saveFileStructure.worldMapName.value) {
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
            
            // World Owner ID
            if (saveFileStructure.worldOwnerId.offset !== null && saveFileStructure.worldOwnerId.length !== null && saveFileStructure.worldOwnerId.value) {
                const worldOwnerId = document.getElementById('edit-world-owner-id').value;
                writeString(modifiedData, saveFileStructure.worldOwnerId.offset, worldOwnerId, saveFileStructure.worldOwnerId.length);
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
        if (!offset || offset < 0 || !maxLength || maxLength <= 0) {
            console.warn('Invalid parameters for writeString');
            return;
        }
        
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