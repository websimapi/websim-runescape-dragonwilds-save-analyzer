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
    let foundJsonData = []; // Store found JSON structures
    
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
        // Initialize structure object as before
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
            sections: [],
            jsonData: [] // Add property to store JSON structures
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
            
            // Search for JSON data structures
            foundJsonData = [];
            findJsonStructures(data);
            saveFileStructure.jsonData = foundJsonData;
            
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
    
    // Find JSON structures in the file
    function findJsonStructures(data) {
        const textData = new TextDecoder().decode(data);
        const possibleJsonStartPositions = [];
        
        // Look for typical JSON start patterns
        for (let i = 0; i < data.length; i++) {
            // Check for '{' character with digits or "Version" nearby
            if (data[i] === 123) { // '{' character
                // Check if this might be the start of a JSON object
                // Look for patterns like {"Version" or {\t"Version"
                let potentialJson = new TextDecoder().decode(data.slice(i, Math.min(i + 50, data.length)));
                if (potentialJson.includes('"Version"') || 
                    /\{\s*\d+\s*:/.test(potentialJson) || 
                    /\{\s*"\w+"\s*:/.test(potentialJson)) {
                    possibleJsonStartPositions.push(i);
                }
            }
        }
        
        console.log(`Found ${possibleJsonStartPositions.length} potential JSON starting positions`);
        
        // For each potential start, try to extract valid JSON
        for (const startPos of possibleJsonStartPositions) {
            try {
                let jsonEndPos = findMatchingCloseBrace(data, startPos);
                if (jsonEndPos !== -1) {
                    const jsonSlice = data.slice(startPos, jsonEndPos + 1);
                    const jsonString = new TextDecoder().decode(jsonSlice);
                    
                    try {
                        // Try to parse it as JSON
                        const parsedJson = JSON.parse(jsonString);
                        
                        // Extract context around the JSON
                        const contextBefore = extractContext(data, Math.max(0, startPos - 100), startPos);
                        const contextAfter = extractContext(data, jsonEndPos + 1, Math.min(data.length, jsonEndPos + 100));
                        
                        // If successful, store it
                        foundJsonData.push({
                            offset: startPos,
                            length: jsonEndPos - startPos + 1,
                            data: parsedJson,
                            rawString: jsonString,
                            contextBefore,
                            contextAfter,
                            type: 'Unknown' // Will be updated by AI analysis
                        });
                        
                        console.log(`Found valid JSON at offset 0x${startPos.toString(16)}`, parsedJson);
                    } catch (jsonError) {
                        // This wasn't valid JSON - try to clean it up
                        try {
                            // Convert tabs to spaces, fix common issues
                            const cleanedJson = jsonString
                                .replace(/\t/g, ' ')
                                .replace(/,\s*}/g, '}')
                                .replace(/,\s*]/g, ']')
                                .replace(/\'/g, '"')
                                .replace(/\\(?!["\\bfnrt\/])/g, '\\\\'); // Fix escaping
                            
                            const parsedJson = JSON.parse(cleanedJson);
                            
                            // Extract context for this JSON too
                            const contextBefore = extractContext(data, Math.max(0, startPos - 100), startPos);
                            const contextAfter = extractContext(data, jsonEndPos + 1, Math.min(data.length, jsonEndPos + 100));
                            
                            foundJsonData.push({
                                offset: startPos,
                                length: jsonEndPos - startPos + 1,
                                data: parsedJson,
                                rawString: jsonString,
                                contextBefore,
                                contextAfter,
                                cleaned: true,
                                type: 'Unknown' // Will be updated by AI analysis
                            });
                            
                            console.log(`Found and cleaned JSON at offset 0x${startPos.toString(16)}`, parsedJson);
                        } catch (cleanError) {
                            // Not valid JSON even after cleaning
                            console.log(`Invalid JSON at offset 0x${startPos.toString(16)}: ${jsonError.message}`);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing potential JSON at offset 0x${startPos.toString(16)}:`, error);
            }
        }
        
        // Once we've found all JSON data, analyze them with AI
        if (foundJsonData.length > 0) {
            analyzeJsonStructuresWithAI();
        }
    }
    
    // Extract human-readable context around a position in binary data
    function extractContext(data, start, end) {
        if (start >= end) return '';
        
        const contextSlice = data.slice(start, end);
        let context = '';
        
        // Try to extract readable strings from the binary data
        for (let i = 0; i < contextSlice.length; i++) {
            const byte = contextSlice[i];
            // Only include printable ASCII characters
            if (byte >= 32 && byte <= 126) {
                context += String.fromCharCode(byte);
            } else if (byte === 0) {
                // Handle null bytes (common in save files)
                context += ' ';
            } else {
                // Replace non-printable with a dot
                context += '.';
            }
        }
        
        // Clean up the context by replacing multiple dots/spaces with a single one
        context = context.replace(/\.{3,}/g, '...');
        context = context.replace(/\s{3,}/g, ' ');
        
        return context.trim();
    }
    
    // Use AI to analyze and categorize JSON structures
    async function analyzeJsonStructuresWithAI() {
        const statusElement = document.createElement('div');
        statusElement.className = 'ai-analysis-status';
        statusElement.textContent = 'Analyzing JSON structures with AI...';
        document.getElementById('player-data').appendChild(statusElement);
        
        // Process JSON structures in batches to avoid overloading the AI service
        const batchSize = 5;
        const batches = Math.ceil(foundJsonData.length / batchSize);
        
        for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
            const start = batchIndex * batchSize;
            const end = Math.min(start + batchSize, foundJsonData.length);
            const batch = foundJsonData.slice(start, end);
            
            statusElement.textContent = `Analyzing JSON structures with AI... (${start + 1}-${end} of ${foundJsonData.length})`;
            
            // Process each JSON in the batch
            const promises = batch.map(async (jsonItem, index) => {
                try {
                    // Prepare data for AI analysis
                    const jsonSample = JSON.stringify(jsonItem.data, null, 2).slice(0, 1500); // Limit size for AI
                    
                    // Create a prompt for the AI
                    const analysisResult = await analyzeJsonWithAI(jsonSample, jsonItem.contextBefore, jsonItem.contextAfter);
                    
                    // Update the JSON type based on AI analysis
                    foundJsonData[start + index].type = analysisResult.type;
                    foundJsonData[start + index].description = analysisResult.description;
                    foundJsonData[start + index].editingTips = analysisResult.editingTips;
                    
                    return analysisResult;
                } catch (error) {
                    console.error(`Error analyzing JSON at offset 0x${jsonItem.offset.toString(16)}:`, error);
                    return null;
                }
            });
            
            // Wait for all promises in this batch to resolve
            await Promise.all(promises);
            
            // Small delay between batches to prevent rate limiting
            if (batchIndex < batches - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Update the UI with the analyzed JSON data
        statusElement.remove();
        refreshPlayerDataView();
    }
    
    // Analyze a single JSON structure using AI
    async function analyzeJsonWithAI(jsonSample, contextBefore, contextAfter) {
        try {
            // Use the websim.chat.completions.create method for AI inference
            const completion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are an AI specialized in analyzing game save file data structures, particularly for RuneScape Dragonwilds. 
                        Your task is to identify the purpose and type of JSON data structures found in save files.
                        Analyze both the JSON content and the surrounding context text to determine what game element this data represents.
                        Be specific and concise in your classification.
                        Respond directly with JSON, following this schema, and no other text:
                        {
                            "type": "string", // A specific category name like "Inventory", "PlayerStats", "QuestLog", "GameSettings", "WorldState", etc.
                            "description": "string", // A brief 1-2 sentence description of what this data structure likely represents
                            "editingTips": "string" // Brief advice on what fields are safe to edit and which should be left alone
                        }`
                    },
                    {
                        role: "user",
                        content: [
                            { 
                                type: "text", 
                                text: `Analyze this JSON structure from a RuneScape Dragonwilds save file.
                                Context text before the JSON: "${contextBefore}"
                                JSON data: ${jsonSample}
                                Context text after the JSON: "${contextAfter}"
                                What type of game data does this JSON structure represent?`
                            }
                        ]
                    }
                ],
                json: true
            });
            
            let result;
            try {
                // Try to parse the response as JSON
                if (typeof completion.content === 'string') {
                    result = JSON.parse(completion.content);
                } else {
                    // If it's already an object, use it directly
                    result = completion.content;
                }
            } catch (error) {
                // Fallback in case the response is not valid JSON
                console.error("Error parsing AI response:", error, "Response was:", completion.content);
                result = {
                    type: "Unknown",
                    description: "Could not determine the structure's purpose",
                    editingTips: "Avoid editing unknown structures"
                };
            }
            
            return result;
        } catch (error) {
            console.error("Error calling AI service:", error);
            return {
                type: "Unknown",
                description: "AI analysis failed",
                editingTips: "Avoid editing this structure as its purpose could not be determined"
            };
        }
    }
    
    // Refresh the player data view after AI analysis
    function refreshPlayerDataView() {
        const playerDataElement = document.getElementById('player-data');
        
        if (!playerDataElement || !saveFileStructure || !saveFileStructure.jsonData) return;
        
        // Update UI with analyzed JSON data
        let playerDataHtml = '';
        
        if (saveFileStructure.jsonData && saveFileStructure.jsonData.length > 0) {
            playerDataHtml = `<p>Found ${saveFileStructure.jsonData.length} JSON data structures in save file:</p>`;
            playerDataHtml += '<div class="json-summary-container">';
            
            saveFileStructure.jsonData.forEach((json, index) => {
                // Add the AI-analyzed type and description
                const jsonType = json.type || 'Unknown';
                const description = json.description || '';
                
                playerDataHtml += `
                <div class="json-summary ${jsonType.toLowerCase().replace(/\s+/g, '-')}">
                    <h4>JSON Structure #${index + 1} - ${jsonType}</h4>
                    <p class="json-description">${description}</p>
                    <p>Offset: 0x${json.offset.toString(16).padStart(8, '0')}, Size: ${json.length} bytes</p>
                    <button class="action-btn view-json-btn" data-index="${index}">View/Edit JSON</button>
                </div>`;
            });
            
            playerDataHtml += '</div>';
            
            // Add the JSON viewer modal if not already present
            if (!document.getElementById('json-modal')) {
                playerDataHtml += `
                <div id="json-modal" class="modal">
                    <div class="modal-content">
                        <span class="close-modal">&times;</span>
                        <h3 id="json-modal-title">JSON Data</h3>
                        <div id="json-description-box" class="json-description-box"></div>
                        <div class="json-edit-container">
                            <textarea id="json-editor"></textarea>
                        </div>
                        <div id="json-editing-tips" class="json-editing-tips"></div>
                        <div class="json-buttons">
                            <button id="save-json-btn" class="action-btn">Save Changes</button>
                            <button id="format-json-btn" class="action-btn">Format JSON</button>
                        </div>
                        <p class="json-warning">Warning: Editing JSON data directly may cause game corruption if not done correctly.</p>
                    </div>
                </div>`;
            }
        } else if (saveFileStructure.playerData.length > 0) {
            playerDataHtml = '<table class="data-table">';
            playerDataHtml += '<tr><th>Offset</th><th>Marker</th><th>Data</th></tr>';
            
            for (const entry of saveFileStructure.playerData) {
                playerDataHtml += `<tr><td>0x${entry.offset.toString(16).padStart(2, '0')}</td><td>${entry.marker}</td><td>${entry.value}</td></tr>`;
            }
            
            playerDataHtml += '</table>';
        } else {
            playerDataHtml = '<p>Advanced player data parsing requires more specific knowledge of the save file format.</p>';
            playerDataHtml += '<p>No JSON data structures detected in this save file.</p>';
        }
        
        playerDataElement.innerHTML = playerDataHtml;
        
        // Set up JSON viewer modal functionality if JSON was found
        if (saveFileStructure.jsonData && saveFileStructure.jsonData.length > 0) {
            setupJsonModal();
        }
    }
    
    // Enhanced modal setup with AI analysis results
    function setupJsonModal() {
        const modal = document.getElementById('json-modal');
        const closeBtn = document.querySelector('.close-modal');
        const viewBtns = document.querySelectorAll('.view-json-btn');
        const saveJsonBtn = document.getElementById('save-json-btn');
        const formatJsonBtn = document.getElementById('format-json-btn');
        const jsonEditor = document.getElementById('json-editor');
        const jsonModalTitle = document.getElementById('json-modal-title');
        const jsonDescriptionBox = document.getElementById('json-description-box');
        const jsonEditingTips = document.getElementById('json-editing-tips');
        
        let currentJsonIndex = -1;
        
        // Open modal when View/Edit button is clicked
        viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index'));
                currentJsonIndex = index;
                
                const jsonData = saveFileStructure.jsonData[index];
                const jsonType = jsonData.type || 'Unknown';
                
                // Set the title with the AI-determined type
                jsonModalTitle.textContent = `JSON Data Structure #${index + 1} - ${jsonType}`;
                
                // Display the AI-generated description
                if (jsonData.description) {
                    jsonDescriptionBox.innerHTML = `<p>${jsonData.description}</p>`;
                    jsonDescriptionBox.style.display = 'block';
                } else {
                    jsonDescriptionBox.style.display = 'none';
                }
                
                // Display editing tips if available
                if (jsonData.editingTips) {
                    jsonEditingTips.innerHTML = `<h4>Editing Tips</h4><p>${jsonData.editingTips}</p>`;
                    jsonEditingTips.style.display = 'block';
                } else {
                    jsonEditingTips.style.display = 'none';
                }
                
                // Format the JSON for better readability
                jsonEditor.value = JSON.stringify(jsonData.data, null, 2);
                
                modal.style.display = 'block';
            });
        });
        
        // Close modal when X is clicked
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Close modal when clicking outside it
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        // Format JSON button
        formatJsonBtn.addEventListener('click', () => {
            try {
                const jsonObj = JSON.parse(jsonEditor.value);
                jsonEditor.value = JSON.stringify(jsonObj, null, 2);
            } catch (error) {
                alert(`Error formatting JSON: ${error.message}`);
            }
        });
        
        // Save JSON changes
        saveJsonBtn.addEventListener('click', () => {
            if (currentJsonIndex === -1) return;
            
            try {
                // Parse the edited JSON to validate it
                const editedJson = JSON.parse(jsonEditor.value);
                
                // Update the JSON in our data structure
                saveFileStructure.jsonData[currentJsonIndex].data = editedJson;
                
                // Mark this JSON as modified for when we save changes
                saveFileStructure.jsonData[currentJsonIndex].modified = true;
                
                alert('JSON changes saved. Click "Save Changes" on the Edit tab to apply to the save file.');
                modal.style.display = 'none';
            } catch (error) {
                alert(`Error: Invalid JSON: ${error.message}`);
            }
        });
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
            
            // Update player data section to include JSON info
            let playerDataHtml = '';
            
            if (saveFileStructure.jsonData && saveFileStructure.jsonData.length > 0) {
                playerDataHtml = `<p>Found ${saveFileStructure.jsonData.length} JSON data structures in save file:</p>`;
                playerDataHtml += '<div class="json-summary-container">';
                
                saveFileStructure.jsonData.forEach((json, index) => {
                    // Create a summary of each JSON structure
                    let jsonSummary = '';
                    
                    // Try to identify what this JSON represents
                    let jsonType = 'Unknown';
                    
                    if (json.data.Version) {
                        if (json.data.Definitions && Array.isArray(json.data.Definitions)) {
                            jsonType = 'Event Definitions';
                        } else if (json.data.MaxSlotIndex !== undefined || json.data.AllowAdds !== undefined) {
                            jsonType = 'Inventory';
                        } else {
                            jsonType = 'Game Data';
                        }
                    }
                    
                    playerDataHtml += `
                    <div class="json-summary">
                        <h4>JSON Structure #${index + 1} - ${jsonType}</h4>
                        <p>Offset: 0x${json.offset.toString(16).padStart(8, '0')}, Size: ${json.length} bytes</p>
                        <button class="action-btn view-json-btn" data-index="${index}">View/Edit JSON</button>
                    </div>`;
                });
                
                playerDataHtml += '</div>';
                
                // Add the JSON viewer modal
                playerDataHtml += `
                <div id="json-modal" class="modal">
                    <div class="modal-content">
                        <span class="close-modal">&times;</span>
                        <h3 id="json-modal-title">JSON Data</h3>
                        <div class="json-edit-container">
                            <textarea id="json-editor"></textarea>
                        </div>
                        <div class="json-buttons">
                            <button id="save-json-btn" class="action-btn">Save Changes</button>
                            <button id="format-json-btn" class="action-btn">Format JSON</button>
                        </div>
                        <p class="json-warning">Warning: Editing JSON data directly may cause game corruption if not done correctly.</p>
                    </div>
                </div>`;
            } else if (saveFileStructure.playerData.length > 0) {
                playerDataHtml = '<table class="data-table">';
                playerDataHtml += '<tr><th>Offset</th><th>Marker</th><th>Data</th></tr>';
                
                for (const entry of saveFileStructure.playerData) {
                    playerDataHtml += `<tr><td>0x${entry.offset.toString(16).padStart(2, '0')}</td><td>${entry.marker}</td><td>${entry.value}</td></tr>`;
                }
                
                playerDataHtml += '</table>';
            } else {
                playerDataHtml = '<p>Advanced player data parsing requires more specific knowledge of the save file format.</p>';
                playerDataHtml += '<p>No JSON data structures detected in this save file.</p>';
            }
            
            playerData.innerHTML = playerDataHtml;
            
            // Set up JSON viewer modal functionality if JSON was found
            if (saveFileStructure.jsonData && saveFileStructure.jsonData.length > 0) {
                setupJsonModal();
            }
            
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
    
    // Add JSON editor styling
    function addJsonEditorStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .json-summary-container {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-bottom: 20px;
            }
            
            .json-summary {
                flex: 1 1 300px;
                padding: 15px;
                background-color: #f0f0f0;
                border-radius: 8px;
                border: 1px solid #ddd;
            }
            
            .json-summary h4 {
                margin-top: 0;
                color: #332200;
                margin-bottom: 10px;
            }
            
            .view-json-btn {
                margin-top: 10px;
                padding: 5px 10px;
                font-size: 14px;
            }
            
            /* Modal styles */
            .modal {
                display: none;
                position: fixed;
                z-index: 1000;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.7);
            }
            
            .modal-content {
                background-color: #fff;
                margin: 5vh auto;
                width: 80%;
                max-width: 900px;
                max-height: 90vh;
                overflow-y: auto;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
            }
            
            .close-modal {
                color: #aaa;
                float: right;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
            }
            
            .close-modal:hover {
                color: #333;
            }
            
            .json-edit-container {
                margin: 15px 0;
            }
            
            #json-editor {
                width: 100%;
                height: 60vh;
                min-height: 300px;
                font-family: monospace;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                white-space: pre;
                font-size: 14px;
            }
            
            .json-buttons {
                margin: 15px 0;
            }
            
            .json-warning {
                color: #856404;
                background-color: #fff3cd;
                padding: 10px;
                border-radius: 4px;
                margin-top: 15px;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Call this on page load
    addJsonEditorStyles();
    
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
            
            // Apply JSON changes
            if (saveFileStructure.jsonData) {
                for (const jsonItem of saveFileStructure.jsonData) {
                    if (jsonItem.modified) {
                        // Convert the modified JSON back to a string
                        const jsonString = JSON.stringify(jsonItem.data);
                        const jsonBytes = new TextEncoder().encode(jsonString);
                        
                        // Check if the size changed
                        if (jsonBytes.length !== jsonItem.length) {
                            alert(`Warning: Modified JSON size has changed from ${jsonItem.length} to ${jsonBytes.length} bytes. This may cause issues with the save file.`);
                        }
                        
                        // Write the modified JSON back to the file
                        // For safety, use the minimum of the original length and new length
                        const bytesToWrite = Math.min(jsonBytes.length, jsonItem.length);
                        for (let i = 0; i < bytesToWrite; i++) {
                            modifiedData[jsonItem.offset + i] = jsonBytes[i];
                        }
                        
                        // If the new JSON is shorter, pad with spaces
                        if (jsonBytes.length < jsonItem.length) {
                            for (let i = jsonBytes.length; i < jsonItem.length; i++) {
                                modifiedData[jsonItem.offset + i] = 32; // Space character
                            }
                        }
                    }
                }
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