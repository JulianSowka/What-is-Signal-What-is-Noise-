// Imports
import * as THREE from './libs/build/three.module.js';
import { EffectComposer } from './libs/postprocessing/EffectComposer.js';
import { RenderPass } from './libs/postprocessing/RenderPass.js';
import { OrbitControls } from './libs/controls/OrbitControls.js';
import { GLTFLoader } from './libs/loaders/GLTFLoader.js';
import { RGBELoader } from './libs/loaders/RGBELoader.js';
import * as dat from './libs/dat.gui.module.js';
import { UnrealBloomPass } from './libs/postprocessing/UnrealBloomPass.js';
import { RenderPixelatedPass } from './libs/postprocessing/RenderPixelatedPass.js';
import { BokehPass } from './libs/postprocessing/BokehPass.js';
import { GlitchPass } from './libs/postprocessing/GlitchPass.js';
import { ShaderPass } from './libs/postprocessing/ShaderPass.js';
import { SepiaShader } from './libs/shaders/SepiaShader.js';
import { FilmPass } from './libs/postprocessing/FilmPass.js';
import { DotScreenPass } from './libs/postprocessing/DotScreenPass.js';
import { AsciiEffect } from './libs/effects/AsciiEffect.js'; // Assuming you have the AsciiEffect.js file
import { AnaglyphEffect } from './libs/effects/AnaglyphEffect.js';


let asciiFolder; // Declare it here and initialize later in setupGUI()
// 🔹 Add this to the global variable section:
let asciiPass = null;
let anaglyphEffect;
let asciiEffect, appContainer;
let modelIndex = 0;
// ✅ Define the model index globally
let currentModelIndex = 0;
// === MIDI Integration === //
let midiAccess = null;
let midiOutput = null;

let camera, scene, renderer, composer, gui;
let ambientLight, pixelationPass, bloomPass, bokehPass, glitchPass, filterPass;
let currentModel = null;
let videoTexture = null;


const hdrLoader = new RGBELoader();  // HDR Loader
let pmremGenerator;  // PMREM Generator for HDR environment mapping

// Rotation step: 1/8 of a full rotation (in radians)
const ROTATION_STEP = Math.PI / 4;

const webcamSettings = {
    brightness: 0.5, // Default brightness for the webcam feed
};
let container; // Declare container as a global variable
// Add Object Transform controls to the GUI
const transformSettings = {
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
  };
// Add Texture Navigation Settings
const textureNavigation = {
    offsetX: 0.5, // Default X offset (centered)
    offsetY: 0.5, // Default Y offset (centered)
};

const asciiSettings = {
    contrast: 50, // Initial contrast level
    font: "monospace", // Default font
    invert: false,
  };

// Add lighting management
// Lighting settings with color property
const lightingSettings = {
    type: 'DirectionalLight',
    intensity: 4.0,
    color: '#ffffff' // Default color
};
let currentLight = null;

// Model paths and settings
const modelPaths = {
    macbook: './models/macbook/scene.gltf',
    iphone: './models/iphone/scene.gltf',
    macintoshclassic: './models/macintoshclassic/scene.gltf',
};
let currentModelName = null;

const modelSettings = { model: 'macbook' };

const textureSettings = {
    zoom: 1,
    pixelSize: 1,
};

const dofSettings = {
    focus: 1.0,
    aperture: 0.025,
    maxblur: 0.01,
};

const glitchSettings = {
    enabled: false,
    goWild: false,
};

const filterSettings = {
    filter: 'none',
};

// Function to dynamically load custom fonts
function loadCustomFonts() {
    const style = document.createElement('style');
    style.innerHTML = `
        @font-face {
            font-family: 'Digital7';
            src: url('./libs/fonts/digital-7 (mono).ttf') format('truetype');
        }
        @font-face {
            font-family: 'Pixel Arial';
            src: url('./libs/fonts/PIXEARG_.TTF') format('truetype');
        }
        @font-face {
            font-family: 'Pockota';
            src: url('./libs/fonts/Pockota-Regular.otf') format('opentype');
        }
        @font-face {
            font-family: 'Pockota-Black';
            src: url('./libs/fonts/Pockota-BlackItalic.otf') format('opentype');
        }
        @font-face {
            font-family: 'Your Groovy Font';
            src: url('./libs/fonts/Your Groovy Font.otf') format('opentype');
        }
    `;
    document.head.appendChild(style);
    console.log("Custom fonts loaded.");
}

// Call this function during initialization
loadCustomFonts();



// ✅ Clears the current model before loading a new one
function clearCurrentModel() {
    if (currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        currentModel = null;
    }
}

const asciiFontOptions = {
    fonts: [
        "monospace",
        "Courier New",
        "Digital7",
        "Pixel Arial",
        "Pockota",
        "Your Groovy Font",
    ],
    selectedFont: "monospace", // Default font
};
init();
animate();

// Ensure `modelTransformConfigs` and `currentModelName` are defined and valid
const modelTransformConfigs = {
    macbook: { rotationMatrix: new THREE.Matrix3() },
    iphone: { rotationMatrix: new THREE.Matrix3() },
    macintoshclassic: { rotationMatrix: new THREE.Matrix3() },
};



const videoShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      videoTexture: { value: null },
      brightness: { value: 1.0 },
      rotation: { value: 0.0 },
      scale: { value: 1.0 },
      flip: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
    uniform sampler2D videoTexture;
    uniform float brightness;
    uniform float rotation;
    uniform float scale;
    uniform float flip;
    varying vec2 vUv;

    void main() {
        // Center the UV coordinates
        vec2 centeredUV = vUv - 0.5;

        // Apply rotation
        float cosRot = cos(rotation);
        float sinRot = sin(rotation);
        vec2 rotatedUV = vec2(
            centeredUV.x * cosRot - centeredUV.y * sinRot,
            centeredUV.x * sinRot + centeredUV.y * cosRot
        );

        // Apply uniform scaling and flipping
        vec2 scaledUV = rotatedUV / scale;

        // Apply flipping along the X-axis
        scaledUV.x *= flip;

        // Return to UV space with offsets applied
 vec2 transformedUV = scaledUV + vec2(0.5, 0.5);

        // Fetch the color from the video texture
        vec4 color = texture2D(videoTexture, transformedUV);

        // Apply brightness adjustment
        gl_FragColor = vec4(color.rgb * brightness, color.a);
    }
`,
  });



function init() {
    appContainer = document.createElement('div');
    document.body.appendChild(appContainer);

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.25, 20);
    camera.position.set(5, 1, 3);

    // Scene
    scene = new THREE.Scene();

    // HDR Background
    new RGBELoader().setPath('./libs/textures/').load('./spot1Lux.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
    });

 
    // Lights
    setupLights();
    


// Initialize MIDI Access
function initMIDI() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
    } else {
        console.error("Web MIDI API not supported in this browser.");
    }
}

function onMIDISuccess(midi) {
    midiAccess = midi;

    // Connect to MIDI Output
    for (let output of midiAccess.outputs.values()) {
        midiOutput = output;
        console.log(`Connected to MIDI Output: ${output.name}`);
        break;
    }

    // Listen for MIDI Input
    for (let input of midiAccess.inputs.values()) {
        input.onmidimessage = handleMIDIMessage;
    }

    initializePadLights();
}

function onMIDIFailure() {
    console.error("Could not access MIDI devices.");
}

// Send MIDI Messages to light up pads
function sendMIDIMessage(command, note, velocity) {
    if (midiOutput) {
        midiOutput.send([command, note, velocity]);
    }
}

// Initialize pad lights
function initializePadLights() {
    // Light up all color pads with default colors
    for (let note = 0; note < 32; note++) {
        const colorCode = hslToAPCColor((note % 8) * 45, 1);
        sendMIDIMessage(0x90, note, colorCode);
    }
}

// Convert HSL to APC Mini color codes
function hslToAPCColor(hue, saturation) {
    if (saturation < 0.3) return 1; // Green (Low Saturation)
    if (hue < 60) return 5;  // Yellow
    if (hue < 120) return 1; // Green
    if (hue < 180) return 7; // Lime
    if (hue < 240) return 4; // Blue
    if (hue < 300) return 3; // Red
    return 6;                // Orange
}

// Function to cycle through models
function cycleModels() {
    const modelKeys = Object.keys(modelPaths);

    // Increment index and loop back to 0 if at the end
    currentModelIndex = (currentModelIndex + 1) % modelKeys.length;

    // Load the model at the new index
    loadModelByIndex(currentModelIndex);
}
// Handle MIDI Messages
// Handle MIDI Messages
function handleMIDIMessage(event) {
    const [status, note, velocity] = event.data;
    const command = status & 0xf0;

    if (command === 0xB0) { // Control Change for sliders
        handleSliderControl(note, velocity);
    } else if (command === 0x90 && velocity > 0) { // Note On
        handleButtonPress(note, velocity);
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) { // Note Off
        handleButtonRelease(note);  // ✅ Correctly defined below
    }
}

// === 1. Improved Check for ASCII Effect ===
function isAsciiEffectActive() {
    return asciiEffect && appContainer.contains(asciiEffect.domElement);
}

function handleButtonRelease(note) {
    console.log(`Button ${note} released`);

    if (note < 32) {
        resetLightColor(note);  // 🟢 Reset Color Pads on release
    } else if (note >= 40 && note <= 46) {
        lightUpButton(note, 4);  // 🔵 Keep Effects pads blue
    } else if (note === 47) {
        lightUpButton(note, 3);  // 🔴 Keep Reset button red
    }
}


function setPadColors() {
    if (!midiOutput) {
        console.warn("⚠️ MIDI Output not initialized.");
        return;
    }

    // APC Mini Color Codes (Double-check with your device documentation)
    const COLOR_OFF = 0;
    const COLOR_GREEN = 1;
    const COLOR_RED = 3;
    const COLOR_YELLOW = 5;

    // Helper function to light up a pad
    function lightPad(note, color) {
        midiOutput.send([0x90, note, color]);
    }

    // 1. Row 1 (56–63): Yellow
    for (let note = 56; note <= 63; note++) {
        lightPad(note, COLOR_YELLOW);
    }

    // 2. Row 2 (48–55): Keep existing logic (no change)

   // 3. **Effects Row (40–46): Set to RED (Always On)**
   for (let note = 40; note <= 47; note++) {
    lightPad(note, COLOR_RED);
}
    // 4. Row 4 (32–39): Green
    for (let note = 32; note <= 39; note++) {
        lightPad(note, COLOR_GREEN);
    }

    // 5. Color Picker Pads (0–31): Yellow
    for (let note = 0; note <= 31; note++) {
        lightPad(note, COLOR_YELLOW);
    }

    // 6. Last Row (64–71): Red
    for (let note = 64; note <= 71; note++) {
        lightPad(note, COLOR_RED);
    }

        // 7. **New Addition**: Buttons 82–92 → Yellow
    for (let note = 82; note <= 92; note++) {
        lightPad(note, COLOR_YELLOW);
    }

    console.log("🔆 Pad colors successfully updated.");
}

function onMIDIInit() {
    initMIDI();  // Existing MIDI setup
    setTimeout(setPadColors, 500);  // Delay to ensure proper initialization
}


// === 2. Corrected ASCII Contrast Control ===
function handleAsciiContrastControl(note, velocity) {
    if (!isAsciiEffectActive()) {
        console.warn("⚠️ ASCII effect is not active. Contrast buttons are disabled.");
        resetAsciiButtonLights();  // Turn off lights if ASCII isn't active
        return;
    }

    // Adjust contrast if ASCII effect is active
    const contrastMapping = {
        48: 9,
        49: 19,
        50: 39,
        51: 49,
        52: 59,
        53: 69,
        54: 79,
        55: 89
    };

    if (contrastMapping.hasOwnProperty(note)) {
        asciiSettings.contrast = contrastMapping[note];
        updateAsciiEffect();
        console.log(`🎨 ASCII Contrast set to: ${asciiSettings.contrast}`);
        updateAsciiButtonLights(note);  // Light up the active button
    }
} 


// === 3. Update Button Lights for ASCII Contrast ===
function updateAsciiButtonLights(activeNote) {
    for (let i = 48; i <= 55; i++) {
        const lightValue = (i === activeNote) ? 127 : 0;  // Light up active button
        if (midiOutput) {
            midiOutput.send([0x90, i, lightValue]);
        }
    }
}// === 4. Reset Lights When ASCII Effect is Off ===
function resetAsciiButtonLights() {
    for (let i = 48; i <= 55; i++) {
        if (midiOutput) {
            midiOutput.send([0x90, i, 0]);  // Turn off all lights
        }
    }
}


// === 5. Updated handleButtonPress to Integrate New Function ===
function handleButtonPress(note, velocity) {
    console.log(`Button ${note} pressed with velocity ${velocity}`);

    
   
    if (note === 46) {
        // Toggle Glitch Effect
        glitchSettings.enabled = !glitchSettings.enabled;
        glitchPass.enabled = glitchSettings.enabled;
        console.log(`🌀 Glitch Effect ${glitchSettings.enabled ? 'enabled' : 'disabled'}`);
        lightUpButton(note, glitchSettings.enabled ? 3 : 0); // Light up in red if enabled
    } 
 else if (note >= 48 && note <= 55) {
    handleAsciiContrastControl(note, velocity);  // ✅ Handle ASCII contrast
} else if (note >= 40 && note <= 46) {
    const effects = ['sepia', 'film', 'blackandwhite', 'halftone', 'ascii', 'anaglyph'];
    applyFilter(effects[note - 40]);
} else if (note === 47) {
    resetEffects();
} else if (note === 71) {
    loadNextModel();
}
 else if (note >= 40 && note <= 45) {
        const effects = ['sepia', 'film', 'blackandwhite', 'halftone', 'ascii', 'anaglyph'];
        applyFilter(effects[note - 40]);
    } else if (note === 47) {
        resetEffects();
    } else if (note === 71) {
        loadNextModel();
    } else if (note >= 64 && note <= 67) {
        rotateCurrentModel(note);
    } else if (note === 68) {
        loadHDRBackground('spot1lux.hdr');
    } else if (note === 69) {
        loadHDRBackground('moonless_golf_1k.hdr');
    } else if (note === 70) {
        loadHDRBackground('quarry_01_1k.hdr');
    } else if (note === 98) {
        window.location.reload();
    } else if (note >= 32 && note <= 39) {
        handleLightControl(note, velocity);
    } else if (note < 32) {
        adjustLightColor(note);
    } else if (note >= 82 && note <= 89) {
        adjustLightIntensity(note);
    } else if (note >= 56 && note <= 63) {
        // Map buttons 56–63 to brightness range [0, 5]
        const minBrightness = 0.0;
        const maxBrightness = 5.0;
        const step = (maxBrightness - minBrightness) / 7; // 8 buttons, 7 intervals
        const index = note - 56;

        webcamSettings.brightness = minBrightness + index * step;
        videoShaderMaterial.uniforms.brightness.value = webcamSettings.brightness;

        console.log(`Screen Brightness set to: ${webcamSettings.brightness}`);
    }
}




function handleLightControl(note, velocity) {
    const buttonValue = velocity / 127;

    switch (note) {
        case 32: // Move Light Z → +8
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 30;
                console.log("🔦 Light moved to Z: +8");
            }
            break;

        case 33:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 12;
                console.log("🔦 Light moved to Z: +6");
            }
            break;

        case 34:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 8;
                console.log("🔦 Light moved to Z: +4");
            }
            break;

        case 35:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 4;
                console.log("🔦 Light moved to Z: +2");
            }
            break;

        case 36: // Center Position
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 0;
                console.log("🔦 Light moved to Z: 0 (Center)");
            }
            break;

        case 37:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = -2;
                console.log("🔦 Light moved to Z: -2");
            }
            break;

        case 38:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = -4;
                console.log("🔦 Light moved to Z: -4");
            }
            break;

        case 39: // Move Light Z → -8
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = -8;
                console.log("🔦 Light moved to Z: -8");
            }
            break;

        default:
            console.warn(`Unhandled light control button: ${note}`);
            break;
    }
}

// Function to rotate the current model on Y and Z axes
function rotateCurrentModel(note) {
    if (!currentModel) {
        console.warn("⚠️ No model loaded to rotate.");
        return;
    }

    switch (note) {
    case 64:
            transformSettings.rotationZ += ROTATION_STEP;  // Rotate +Y
            console.log("🔄 Rotated +1/8 on Y-axis");
            break;
        case 65:
            transformSettings.rotationZ -= ROTATION_STEP;  // Rotate -Y
            console.log("🔄 Rotated -1/8 on Y-axis");
            break;
        case 66:
            transformSettings.rotationY -= ROTATION_STEP;  // Rotate -Y
            console.log("🔄 Rotated -1/8 on Y-axis");
            break;
        case 67:
            transformSettings.rotationY += ROTATION_STEP;  // Rotate +Y
            console.log("🔄 Rotated +1/8 on Y-axis");
            break;
        default:
            console.warn("🚫 Invalid button for rotation.");
            return;
    }

    // ✅ Apply the updated rotation while preserving position
    updateObjectTransform();
}

function loadHDRBackground(path) {
    const hdrLoader = new RGBELoader();

    hdrLoader.setPath('./libs/textures/').load(path, function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;

        // Ensure PMREM Generator exists
        if (!pmremGenerator) {
            console.error("❌ PMREM Generator is not initialized.");
            return;
        }

        const envMap = pmremGenerator.fromEquirectangular(texture).texture;

        // Apply to scene background and environment
        scene.environment = envMap;
        scene.background = envMap;

        texture.dispose();  // Free up memory
        console.log(`🌄 HDR Background switched to: ${path}`);
    }, undefined, function (error) {
        console.error('❌ Failed to load HDR background:', error);
    });
}

function lightUpButton(note, colorCode) {
    if (midiOutput) {
        midiOutput.send([0x90, note, colorCode]);
    } else {
        console.warn("MIDI Output not initialized.");
    }
}

function adjustLightIntensity(note) {
    // Map buttons 82 (max) to 89 (min) to light intensity between 4.0 and 0.0
    const maxIntensity = 20.0;
    const minIntensity = 0.0;

    // Calculate step size for 8 buttons (82-89)
    const step = (maxIntensity - minIntensity) / 7;

    // Button 82 → max intensity, 89 → min intensity
    const intensity = maxIntensity - ((note - 82) * step);

    lightingSettings.intensity = intensity;
    updateLighting();

    console.log(`💡 Light intensity set to: ${intensity.toFixed(2)}`);
}

// Adjust light color based on pad press
function adjustLightColor(note) {
    const row = Math.floor(note / 8);
    const col = note % 8;

    const hue = (col / 7) * 360;
    const saturation = 1 - (row / 3);
    const color = new THREE.Color().setHSL(hue / 360, saturation, 0.5);
    lightingSettings.color = `#${color.getHexString()}`;
    updateLighting();

 // 1. Update lighting settings
 lightingSettings.color = `#${color.getHexString()}`;
 updateLighting();

 // 2. Sync with GUI light folder
 if (gui) {
     gui.__folders['Lighting'].__controllers.forEach(controller => {
         if (controller.property === 'color') {
             controller.setValue(lightingSettings.color);
         }
     });
 }

 // 3. Update ASCII effect text color
 if (asciiEffect) {
     asciiEffect.domElement.style.color = `#${color.getHexString()}`;
 }

 console.log(`🎨 Adjusted Light Color: ${lightingSettings.color}`);
}

// ✅ Reset Light Color (When Pad is Released)
function resetLightColor(note) {
    lightUpButton(note, 1);  // Reset pad color to green
    console.log(`🔄 Reset Light Pad ${note}`);
}


function moveLightOnZAxis(note) {
    if (!currentLight || !(currentLight instanceof THREE.DirectionalLight)) {
        console.warn("⚠️ No Directional Light to move.");
        return;
    }

    const maxZ = 8;   // Z-axis maximum position
    const minZ = -8;  // Z-axis minimum position

    // Map buttons 32–39 to Z-axis positions between 8 and -8
    const step = (maxZ - minZ) / 7;  // 7 steps between 8 buttons
    const newZ = maxZ - ((note - 32) * step);

    currentLight.position.z = newZ;

    console.log(`🔦 Directional Light Z-position set to: ${newZ}`);
}


function handleSliderControl(note, velocity) {
    const sliderValue = velocity / 127;

    switch (note) {
        case 48: // Slider 1 → Camera Zoom
            camera.zoom = 0.1 + sliderValue * 10;
            camera.updateProjectionMatrix();
            updateCameraInfo();  // ✅ Update info box
            console.log(`Camera Zoom: ${camera.zoom}`);
            break;

        case 49: // Slider 2 → DOF Focus
            dofSettings.focus = 0.1 + sliderValue * 20;
            if (bokehPass && bokehPass.uniforms) {
                bokehPass.uniforms.focus.value = dofSettings.focus;
            }
            updateCameraInfo();  // ✅ Update info box
            console.log(`DOF Focus: ${dofSettings.focus}`);
            break;

            case 50: // Slider 3 → DOF Aperture
            dofSettings.aperture = 0.001 + sliderValue * 0.099; // Map slider to range [0.001, 0.1]
            if (bokehPass && bokehPass.uniforms) {
                bokehPass.uniforms.aperture.value = dofSettings.aperture;
            }
            updateCameraInfo();  // Update the info box if relevant
            console.log(`DOF Aperture: ${dofSettings.aperture}`);
            break;

        case 51: // Slider 4 → Webcam Zoom
            textureSettings.zoom = 0.1 + sliderValue * 5;
            updateTextureTransform();
            console.log(`Webcam Zoom: ${textureSettings.zoom}`);
            break;

        case 52: // Slider 5 → Pixelation Level
            textureSettings.pixelSize = 1 + sliderValue * 600;
            if (pixelationPass) {
                pixelationPass.setPixelSize(textureSettings.pixelSize);
            }
            console.log(`Pixelation Level: ${textureSettings.pixelSize}`);
            break;
        

            case 53: // Slider 6 → Inverted Bloom Strength
            bloomPass.threshold = (1 - sliderValue) * 3;  // Inverted scale
            console.log(`Inverted Bloom strength: ${bloomPass.threshold}`);
            break;

    case 54: // Slider 7 → Object X Position
    transformSettings.positionX = (sliderValue * 20) - 10;
    updateObjectTransform();  // ✅ Position only, rotation preserved
    console.log(`Object X Position: ${transformSettings.positionX}`);
    break;

case 55: // Slider 8 → Object Y Position
    transformSettings.positionY = (sliderValue * 20) - 10;
    updateObjectTransform();  // ✅ Position only, rotation preserved
    console.log(`Object Y Position: ${transformSettings.positionY}`);
    break;

case 56: // Slider 9 → Object Z Position
    transformSettings.positionZ = (sliderValue * 20) - 10;
    updateObjectTransform();  // ✅ Position only, rotation preserved
    console.log(`Object Z Position: ${transformSettings.positionZ}`);
    break;

        case 32: // Move Light Z → +8
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 8;
                console.log("🔦 Light moved to Z: +8");
            }
            break;

        case 33:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 6;
                console.log("🔦 Light moved to Z: +6");
            }
            break;

        case 34:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 4;
                console.log("🔦 Light moved to Z: +4");
            }
            break;

        case 35:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 2;
                console.log("🔦 Light moved to Z: +2");
            }
            break;

        case 36: // Center Position
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = 0;
                console.log("🔦 Light moved to Z: 0 (Center)");
            }
            break;

        case 37:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = -2;
                console.log("🔦 Light moved to Z: -2");
            }
            break;

        case 38:
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = -4;
                console.log("🔦 Light moved to Z: -4");
            }
            break;

        case 39: // Move Light Z → -8
            if (currentLight && currentLight instanceof THREE.DirectionalLight) {
                currentLight.position.z = -8;
                console.log("🔦 Light moved to Z: -8");
            }
            break;


default:
    console.warn(`Unhandled slider: ${note}`);
}
}

// === Initialize MIDI on Load === //
window.addEventListener('load', initMIDI);
initMIDI();  // Existing MIDI setup
setTimeout(setPadColors, 500); 

   // Renderer setup
   renderer = new THREE.WebGLRenderer({ antialias: true });
   renderer.setPixelRatio(window.devicePixelRatio);
   renderer.setSize(window.innerWidth, window.innerHeight);
   renderer.toneMapping = THREE.ACESFilmicToneMapping;
   appContainer.appendChild(renderer.domElement);

// PMREM Generator Initialization
pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
   

    // Postprocessing Composer
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Pixelation Pass
    pixelationPass = new RenderPixelatedPass(textureSettings.pixelSize, scene, camera);
    composer.addPass(pixelationPass);

    // Bloom Pass
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    composer.addPass(bloomPass);

    // Depth of Field (DOF) Pass
    bokehPass = new BokehPass(scene, camera, {
        focus: dofSettings.focus,
        aperture: dofSettings.aperture,
        maxblur: dofSettings.maxblur,
    });
    composer.addPass(bokehPass);

    // Glitch Pass
    glitchPass = new GlitchPass();
    glitchPass.enabled = glitchSettings.enabled;
    glitchPass.goWild = glitchSettings.goWild;
    composer.addPass(glitchPass);

    // Shader Pass (Filters)
    filterPass = new ShaderPass(SepiaShader);
    filterPass.enabled = false;
    composer.addPass(filterPass);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controls.target.set(0, 0, -0.2);
    controls.update();

    // Webcam Setup
    setupWebcam();

    // Load Default Model
    loadModel(modelPaths[modelSettings.model]);
// Call this function during initialization
loadCustomFonts();
    // GUI Setup
    setupGUI();
    setupAsciiEffect();
    filterSettings.filter = 'none';

    // Window Resize Handling
    window.addEventListener('resize', onWindowResize);
    
}

function adjustActiveEffect(activeEffect, index) {
  
   // Safeguard: Check if an effect is active
    if (!activeEffect || activeEffect === "none") {
        console.warn(`No adjustable parameters for the effect: ${activeEffect}`);
        return; // Exit early to prevent errors
    }
  
    const stepSize = 1.0 / 7; // Divide the range into 8 steps

    switch (activeEffect) {
        case 'ascii':
            // Adjust ASCII Contrast (range 10–100)
            asciiSettings.contrast = 10 + index * 12.857; // Map to [10, 100]
            updateAsciiEffect();
            console.log(`ASCII Contrast set to: ${asciiSettings.contrast}`);
            break;

            case 'glitch':
                // Adjust Glitch Wildness (goWild intensity)
                glitchSettings.goWild = index > 3; // Enable wildness for buttons 52–55
                glitchPass.goWild = glitchSettings.goWild; // Sync to glitch pass
                console.log(`Glitch Wildness: ${glitchSettings.goWild ? 'High' : 'Low'}`);
                break;
    
            case 'anaglyph':
                // Adjust Anaglyph Layer Separation
                if (anaglyphPass && anaglyphPass.uniforms && anaglyphPass.uniforms.separation) {
                    anaglyphPass.uniforms.separation.value = 0.005 + index * stepSize * 0.02; // Map to [0.005, 0.02]
                    console.log(`Anaglyph Separation set to: ${anaglyphPass.uniforms.separation.value}`);
                } else {
                    console.warn("Anaglyph pass or its uniforms are not initialized.");
                }
                break;
    
            case 'halftone':
                // Adjust Halftone Scale
                if (halftonePass && halftonePass.uniforms && halftonePass.uniforms.scale) {
                    halftonePass.uniforms.scale.value = 1.0 + index * stepSize * 9.0; // Map to [1.0, 10.0]
                    console.log(`Halftone Scale set to: ${halftonePass.uniforms.scale.value}`);
                } else {
                    console.warn("Halftone pass or its uniforms are not initialized.");
                }
                break;
    
        default:
            console.warn(`No adjustable parameters for the effect: ${activeEffect}`);
    }
}



// Function to setup webcam with brightness adjustment
function setupWebcam() {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
            video.srcObject = stream;

            video.addEventListener('canplay', () => {
                videoTexture = new THREE.VideoTexture(video);
                videoTexture.minFilter = THREE.LinearFilter;
                videoTexture.magFilter = THREE.LinearFilter;
                videoTexture.format = THREE.RGBAFormat;
                videoTexture.wrapS = THREE.ClampToEdgeWrapping;
                videoTexture.wrapT = THREE.ClampToEdgeWrapping;

                // Assign videoTexture to the shader material
                videoShaderMaterial.uniforms.videoTexture.value = videoTexture;

                updateTextureTransform();
            });

            video.play();
        })
        .catch((err) => console.error('Error accessing webcam:', err));
}

function applyVideoTextureTransform(rotationMatrix, zoom, offsetX = 0.5, offsetY = 0.5) {
    if (videoTexture) {
        videoTexture.matrixAutoUpdate = false; // Disable auto-updates for manual control

        const scale = zoom; // Uniform scaling for both axes
        const cos = rotationMatrix.elements[0]; // Cosine of rotation
        const sin = rotationMatrix.elements[3]; // Sine of rotation

        // Set UV matrix to include rotation, scaling, and offsets
        videoTexture.matrix.set(
            scale * cos, -scale * sin, offsetX - scale * 0.5 * cos + scale * 0.5 * sin,
            scale * sin, scale * cos, offsetY - scale * 0.5 * cos - scale * 0.5 * sin,
            0, 0, 1
        );

        videoTexture.needsUpdate = true; // Mark texture as updated

        // Log the transformations for debugging
        console.log("applyVideoTextureTransform:");
        console.log("Scale:", scale, "OffsetX:", offsetX, "OffsetY:", offsetY);
        console.log("Matrix:", videoTexture.matrix);
    }
}


const AnaglyphShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "separation": { value: 0.005 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float separation;
        varying vec2 vUv;

        void main() {
            vec2 offset = vec2(separation, 0.0);
            vec4 color;
            color.r = texture2D(tDiffuse, vUv + offset).r;
            color.g = texture2D(tDiffuse, vUv - offset).g;
            color.b = texture2D(tDiffuse, vUv - offset).b;
            color.a = 1.0;
            gl_FragColor = color;
        }
    `
};let anaglyphPass;

function setupAnaglyphEffect() {
    anaglyphPass = new ShaderPass(AnaglyphShader);
    anaglyphPass.uniforms["separation"].value = 0.005; // Adjust for stronger/weaker 3D effect

    composer.addPass(anaglyphPass);
    console.log("✅ Anaglyph effect initialized.");
}

function updateTextureTransform() {
    if (videoTexture && currentModelName) {
        const zoom = textureSettings.zoom;

        // Define precise rotation angles and flips for each model
        const rotationAngles = {
            macbook: Math.PI / 2, // Rotate 90 degrees
            iphone: Math.PI / -2, // Rotate 90 degrees
            macintoshclassic: Math.PI / 1, // Rotate 90 degrees
        };

        const flipValues = {
            macbook: 1.0, // No flip
            iphone: 1.0,  // No flip
            macintoshclassic: 1.0, // Flip horizontally
        };

        videoShaderMaterial.uniforms.rotation.value = rotationAngles[currentModelName] || 0;
        videoShaderMaterial.uniforms.scale.value = zoom;
        videoShaderMaterial.uniforms.flip.value = flipValues[currentModelName] || 1.0;
    }
}

// ✅ Function to capture and download a screenshot
function takeScreenshot() {
    renderer.render(scene, camera);  // Ensure the latest frame is rendered

    const screenshot = renderer.domElement.toDataURL('image/png');  // Capture as PNG
    const downloadLink = document.createElement('a');
    downloadLink.href = screenshot;
    downloadLink.download = 'screenshot.png';  // Set filename
    downloadLink.click();  // Trigger download

    console.log("📸 Screenshot taken and downloaded.");
}

function resetEffects() {
    if (filterPass) {
        composer.removePass(filterPass);
        filterPass = null;
    }

    if (asciiEffect && appContainer.contains(asciiEffect.domElement)) {
        appContainer.removeChild(asciiEffect.domElement);
    }

    // Properly Dispose of Anaglyph Effect
    if (anaglyphEffect && appContainer.contains(anaglyphEffect.domElement)) {
        appContainer.removeChild(anaglyphEffect.domElement);
        anaglyphEffect.dispose();
        anaglyphEffect = null;
    }

    // ❗ Remove the Anaglyph Pass from Composer if it exists
    if (anaglyphPass) {
        composer.removePass(anaglyphPass);
        anaglyphPass = null;
    }

    glitchPass.enabled = false;

    if (!appContainer.contains(renderer.domElement)) {
        appContainer.appendChild(renderer.domElement);
    }

    console.log("🔄 All effects reset.");
}

function applyFilter(filterName) {
    resetEffects();  // Reset previous effects before applying a new one

    switch (filterName) {
        case 'sepia':
            filterPass = new ShaderPass(SepiaShader);
            composer.addPass(filterPass);
            console.log("Sepia filter applied.");
            break;

        case 'film':
            filterPass = new FilmPass(0.35, false);
            composer.addPass(filterPass);
            console.log("Film filter applied.");
            break;

        case 'blackandwhite':
            filterPass = new FilmPass(0.35, true);
            composer.addPass(filterPass);
            console.log("Black & White filter applied.");
            break;

        case 'halftone':
            filterPass = halftonePass;
            composer.addPass(filterPass);
            updateHalftoneEffect();
            console.log("Halftone filter applied.");
            break;

            case 'ascii':
                toggleAsciiEffect(true);
                console.log("ASCII effect applied.");
                updateAsciiButtonLights();  // ✅ Light up buttons when ASCII is active
                break;
                

        case 'anaglyph':
            setupAnaglyphEffect();
            console.log("Anaglyph effect applied.");
            break;

        case 'glitch':
            glitchPass.enabled = !glitchPass.enabled;
            console.log(`Glitch effect ${glitchPass.enabled ? 'enabled' : 'disabled'}.`);
            break;

        default:
            resetAsciiButtonLights();  // ✅ Turn off lights for non-ASCII effects
            console.warn("Unknown filter:", filterName);
            break;
    }
    updateAsciiButtonLights();  // ✅ Update lights after applying a filter
}

// === Setup ASCII Effect ===
function setupAsciiEffect() {
    if (!renderer) {
        console.error("❌ Renderer is not initialized. Cannot create ASCII effect.");
        return;
    }

    try {
        // Initialize ASCII Effect
        const charset = generateCharset(asciiSettings.contrast);
        asciiEffect = new AsciiEffect(renderer, charset, {
            invert: asciiSettings.invert,
        });

        asciiEffect.setSize(window.innerWidth, window.innerHeight);
        asciiEffect.domElement.style.color = lightingSettings.color;
        asciiEffect.domElement.style.backgroundColor = "black";

        console.log("✅ ASCII effect initialized successfully.");
    } catch (error) {
        console.error("❌ Error initializing ASCII effect:", error);
    }
}

// === Toggle ASCII Effect ===
function toggleAsciiEffect(enable) {
    if (enable) {
        resetEffects();  // Disable other effects first
        setupAsciiEffect();  // Ensure ASCII effect is set up

        if (asciiEffect && asciiEffect.domElement) {
            if (appContainer.contains(renderer.domElement)) {
                appContainer.removeChild(renderer.domElement);
            }
            appContainer.appendChild(asciiEffect.domElement);
            console.log("✅ ASCII effect enabled.");
        } else {
            console.error("❌ ASCII effect DOM element is missing.");
        }
    } else {
        if (asciiEffect && appContainer.contains(asciiEffect.domElement)) {
            appContainer.removeChild(asciiEffect.domElement);
        }

        if (!appContainer.contains(renderer.domElement)) {
            appContainer.appendChild(renderer.domElement);
        }

        console.log("❌ ASCII effect disabled.");
    }
}


// === Enhanced Anaglyph Effect Toggle === //
function toggleAnaglyphEffect(enable) {
    if (enable) {
        resetEffects();  // Clear other effects
        setupAnaglyphEffect();  // Initialize AnaglyphEffect

        if (anaglyphEffect && anaglyphEffect.domElement) {
            if (appContainer.contains(renderer.domElement)) {
                appContainer.removeChild(renderer.domElement);
            }

            if (!appContainer.contains(anaglyphEffect.domElement)) {
                appContainer.appendChild(anaglyphEffect.domElement);
                console.log("✅ Anaglyph effect enabled.");
            }
        } else {
            console.error("❌ Failed to initialize Anaglyph effect.");
        }
    } else {
        if (anaglyphEffect && appContainer.contains(anaglyphEffect.domElement)) {
            appContainer.removeChild(anaglyphEffect.domElement);
            anaglyphEffect.dispose();
            anaglyphEffect = null;
        }

        if (!appContainer.contains(renderer.domElement)) {
            appContainer.appendChild(renderer.domElement);
        }

        console.log("❌ Anaglyph effect disabled.");
    }
}


const halftoneShader = {
    uniforms: {
        tDiffuse: { value: null },
        tSize: { value: new THREE.Vector2(256, 256) },
        center: { value: new THREE.Vector2(0.5, 0.5) },
        angle: { value: Math.PI / 4 },
        scale: { value: 10.0 }, // Controls the size of the dots
        color: { value: new THREE.Color(0xffffff) }, // Dynamic light color
        contrast: { value: 1.0 }, // Contrast adjustment
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 tSize;
        uniform vec2 center;
        uniform float angle;
        uniform float scale;
        uniform vec3 color;
        uniform float contrast;
        varying vec2 vUv;

        void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            
            // Halftone pattern
            vec2 coord = vUv * tSize - center * tSize;
            float s = sin(angle), c = cos(angle);
            vec2 rotatedCoord = vec2(coord.x * c - coord.y * s, coord.x * s + coord.y * c);
            vec2 grid = mod(rotatedCoord * scale, 1.0);
            float dist = length(grid - vec2(0.5)); // Distance to the center of the cell

            // Smooth transition for dots
            float dot = smoothstep(0.5, 0.4, dist * contrast);

            // Combine texture and halftone pattern
            vec3 halftoneColor = texel.rgb * color * dot;
            gl_FragColor = vec4(halftoneColor, texel.a);
        }
    `,
};


  
function updateObjectTransform() {
    if (currentModel) {
        // Preserve rotation while updating position
        currentModel.position.set(
            transformSettings.positionX,
            transformSettings.positionY,
            transformSettings.positionZ
        );

        // Preserve existing rotation
        currentModel.rotation.set(
            transformSettings.rotationX,
            transformSettings.rotationY,
            transformSettings.rotationZ
        );
    }
}

// Halftone Pass Setup
const halftonePass = new ShaderPass(halftoneShader);

// Update Halftone Effect Dynamically
function updateHalftoneEffect() {
    if (halftonePass) {
        halftonePass.uniforms.color.value.set(lightingSettings.color); // Update color
        halftonePass.uniforms.contrast.value = asciiSettings.contrast / 50.0; // Map contrast to shader
        halftonePass.uniforms.scale.value = asciiSettings.contrast / 10.0; // Adjust scale based on contrast
    }
}


function updateAsciiEffect() {
    if (!asciiEffect) return;

    // Adjust charset based on contrast
    const charset = generateCharset(asciiSettings.contrast);

    // Remove the current ASCII effect DOM element
    if (asciiEffect.domElement.parentNode) {
        asciiEffect.domElement.parentNode.removeChild(asciiEffect.domElement);
    }

    // Recreate the ASCII effect with updated settings
    asciiEffect = new AsciiEffect(renderer, charset, {
        invert: asciiSettings.invert,
        fontFamily: asciiFontOptions.selectedFont, // Use the selected font
    });

    // Set size and apply styles dynamically
    asciiEffect.setSize(window.innerWidth, window.innerHeight);
    asciiEffect.domElement.style.fontFamily = asciiFontOptions.selectedFont; // Apply selected font
    asciiEffect.domElement.style.color = `#${new THREE.Color(lightingSettings.color).getHexString()}`;
    asciiEffect.domElement.style.backgroundColor = "black";

    // Append the updated effect to the app container
    appContainer.appendChild(asciiEffect.domElement);

    console.log(`Updated ASCII effect with font: ${asciiFontOptions.selectedFont}`);
}

// Helper function to generate charset based on contrast
function generateCharset(contrast) {
    if (contrast < 10) {
        return " ._|";
    } else if (contrast < 20) {
        return " WhatisSignal?Noise?";
    } else if (contrast < 30) {
        return " ._:-|";
    } else if (contrast < 40) {
        return " ._amb|";
    } else if (contrast < 50) {
        return " ba._:-+*maBa|Ma";
    } else if (contrast < 60) {
        return " ._:-+*=%|";
    } else if (contrast < 70) {
        return " ._:-+*=%@|";
    } else if (contrast < 80) {
        return " ._:-+*=%@#abcdefghijklmnopqrstuvwxyz|";
    } else if (contrast < 90) {
        return " ._:-+*=%@#abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ|";
    } else {
        return " ._:|-+*=%@#abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑ";
    }
}

const modelKeys = Object.keys(modelPaths);
// Updated Function to Load the Next Model on Button 71 Press


// ✅ Improved model switcher (for MIDI button 71 and GUI)
function loadNextModel() {
    const modelKeys = Object.keys(modelPaths);
    currentModelIndex = (currentModelIndex + 1) % modelKeys.length;  // Cycle through models

    loadModelByIndex(currentModelIndex);

    // Update GUI (if applicable)
    if (gui) {
        gui.__controllers.forEach((controller) => {
            if (controller.property === 'model') {
                controller.setValue(modelKeys[currentModelIndex]);
            }
        });
    }

    console.log(`🔄 Switched to model: ${modelKeys[currentModelIndex]}`);
}


function removeCurrentModel() {
    if (currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            }
        });
        currentModel = null;
    }
}

function setupLights() {
    // Replace AmbientLight with DirectionalLight
    currentLight = new THREE.DirectionalLight(0xffffff, lightingSettings.intensity);
    currentLight.position.set(5, 10, 20);  // Adjust position for optimal illumination
    scene.add(currentLight);
}

// ✅ Load a model by index safely
function loadModelByIndex(index) {
    const modelKeys = Object.keys(modelPaths);
    const modelKey = modelKeys[index];
    const modelPath = modelPaths[modelKey];

    clearCurrentModel();  // Ensure the current model is cleared

    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
        currentModel = gltf.scene;

        // Apply video texture to specific meshes
        currentModel.traverse((child) => {
            if (child.isMesh && child.material && child.material.name.includes('stream')) {
                child.material = videoShaderMaterial;
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
                updateTextureTransform();
            }
        });

        scene.add(currentModel);

        // Apply specific webcam rotation based on model
        switch (index) {
            case 0: updateTextureRotation(0); break;               // MacBook
            case 1: updateTextureRotation(Math.PI / 2); break;     // iPhone
            case 2: updateTextureRotation(Math.PI); break;         // Macintosh Classic
        }

        console.log(`🔄 Loaded model: ${modelKey}`);
    }, undefined, (error) => {
        console.error('❌ Error loading model:', error);
    });
}



    // Load the new model
    loader.load(modelPaths[index], (gltf) => {
        currentModel = gltf.scene;
        scene.add(currentModel);
        console.log(`Loaded model: ${modelPaths[index]}`);
    }, undefined, (error) => {
        console.error('Error loading model:', error);
    });



function loadModel(modelPath) {
    currentModelName = Object.keys(modelPaths).find((key) => modelPaths[key] === modelPath);

    if (currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map && child.material.map !== videoTexture) {
                        child.material.map.dispose();
                    }
                    child.material.dispose();
                }
            }
        });
        currentModel = null;
    }

    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
        currentModel = gltf.scene;

        currentModel.traverse((child) => {
            if (child.isMesh && child.material) {
                if (
                    child.material.name === 'macbookstream' ||
                    child.material.name === 'iphonestream' ||
                    child.material.name === 'macclassicstream'
                ) {
                    // Apply the video texture material
                    child.material = videoShaderMaterial;
                    child.material.side = THREE.DoubleSide; // Ensure double-sided rendering
                    console.log('Applied videoShaderMaterial to:', child.name);
                    updateTextureTransform(); // Apply texture transformation
                    
                }
                child.material.needsUpdate = true;
            }
        });

        scene.add(currentModel);
        composer.render();
    });
}


// Create a reference to the info box
const cameraInfoBox = document.getElementById('camera-info');
function updateCameraInfo() {
    const cameraInfoBox = document.getElementById('camera-info');
    
    if (cameraInfoBox && camera) {  // Ensure the element and camera exist
        // Get the focal length (zoom) in mm, rounded to no decimal points
        const focalLength = Math.round(camera.zoom * 35); // Assuming a base focal length of 35mm

         const focalDistance = Math.round(dofSettings.focus);
        const aperture = dofSettings.aperture;

        cameraInfoBox.innerHTML = `
            <strong>Focal Length:</strong> ${focalLength} mm |
            <strong>Focal Distance:</strong> ${focalDistance.toFixed(2)} m |
            <strong>Aperture:</strong> f/${(1 / aperture).toFixed(1)}
        `;
    } else {
        console.warn("📛 Camera info element or camera not initialized.");
    }
}


function setupGUI() {
    gui = new dat.GUI();
    function loadModel(modelPath) {
    currentModelName = Object.keys(modelPaths).find((key) => modelPaths[key] === modelPath);

    if (currentModel) {
        scene.remove(currentModel);
        currentModel.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map && child.material.map !== videoTexture) {
                        child.material.map.dispose();
                    }
                    child.material.dispose();
                }
            }
        });
        currentModel = null;
    }

    loader.load(modelPath, (gltf) => {
        currentModel = gltf.scene;

        currentModel.traverse((child) => {
            if (child.isMesh && child.material) {
                if (child.material.name === 'macbookstream' ||
                    child.material.name === 'iphonestream' ||
                    child.material.name === 'macclassicstream') {
                    child.material = videoShaderMaterial;
                    updateTextureTransform();
                    // Set material to emissive to make it independent of lighting
                    child.material.emissive = new THREE.Color(0xffffff);
                    child.material.emissiveMap = videoTexture;

                    // Reduce brightness by lowering the emissive intensity
                    child.material.emissiveIntensity = 0.5; // Lower value for darker feed

                    updateTextureTransform();
                }
                child.material.needsUpdate = true;
            }
        });

        scene.add(currentModel);
        composer.render();
    });
}
    // Model controls
    gui.add({ nextModel: loadNextModel }, 'nextModel').name('Next Model');

    gui.add(webcamSettings, 'brightness', -1, 2.0, 0.1).name('Screenbrightness').onChange((value) => {
        videoShaderMaterial.uniforms.brightness.value = value;
    });
        

    // Texture controls
    gui.add(textureSettings, 'zoom', 0.1, 5, 0.1).name('webcam Zoom').onChange(updateTextureTransform);
    gui.add(textureSettings, 'pixelSize', 1, 600, 1).name('Pixelation Level').onChange((value) => {
        pixelationPass.setPixelSize(value);
    });

    // Bloom controls
    gui.add(bloomPass, 'threshold', 0.0, 1.0).name('Bloom Threshold');
    gui.add(bloomPass, 'strength', 0.0, 3.0).name('Bloom Strength');
    gui.add(bloomPass, 'radius', 0.0, 1.0).name('Bloom Radius');

    // Depth of Field controls
    gui.add(dofSettings, 'focus', 0.1, 20).name('DOF Focus').onChange((value) => {
        bokehPass.uniforms.focus.value = value;
        updateCameraInfo();  // ✅ Update display
    });
    
    gui.add(dofSettings, 'aperture', 0.001, 0.1).name('DOF Aperture').onChange((value) => {
        bokehPass.uniforms.aperture.value = value;
        updateCameraInfo();  // ✅ Update display
    });
    gui.add(dofSettings, 'maxblur', 0.0, 0.1).name('DOF Max Blur').onChange((value) => {
        bokehPass.uniforms.maxblur.value = value;
    });

    // Glitch controls
    gui.add(glitchSettings, 'enabled').name('Enable Glitch').onChange((value) => {
        glitchPass.enabled = value;
    });
    gui.add(glitchSettings, 'goWild').name('Glitch Me Wild').onChange((value) => {
        glitchPass.goWild = value;
    });

    const asciiFolder = gui.addFolder("ASCII Effect");
    
    gui.add(filterSettings, 'filter', ['none', 'sepia', 'film', 'blackandwhite', 'halftone', 'ascii', 'anaglyph'])
    .name('Filter')
    .onChange((value) => {
        applyFilter(value);
    });
// Add contrast slider
asciiFolder.add(asciiSettings, "contrast", 10, 100, 1)
    .name("Contrast")
    .onChange(() => {
        updateAsciiEffect();
    });
asciiFolder.add(asciiSettings, "invert").name("Invert").onChange(() => {
    updateAsciiEffect();
});
// Add dropdown for font selection
asciiFolder.add(asciiFontOptions, "selectedFont", asciiFontOptions.fonts)
    .name("Font")
    .onChange(() => {
        updateAsciiEffect();
    });
asciiFolder.open();

const screenshotFolder = gui.addFolder('Screenshot');
screenshotFolder.add({ 'Take Screenshot': takeScreenshot }, 'Take Screenshot').name('📸 Capture Scene');
screenshotFolder.open();

// Add Transform GUI Folder
const transformFolder = gui.addFolder("Object Transform");

// Position controls
transformFolder
  .add(transformSettings, "positionX", -10, 10, 0.1)
  .name("Position X")
  .onChange(updateObjectTransform);
transformFolder
  .add(transformSettings, "positionY", -10, 10, 0.1)
  .name("Position Y")
  .onChange(updateObjectTransform);
transformFolder
  .add(transformSettings, "positionZ", -10, 10, 0.1)
  .name("Position Z")
  .onChange(updateObjectTransform);

// Rotation controls
transformFolder
  .add(transformSettings, "rotationX", -180, 180, 1)
  .name("Rotation X")
  .onChange(updateObjectTransform);
transformFolder
  .add(transformSettings, "rotationY", -180, 180, 1)
  .name("Rotation Y")
  .onChange(updateObjectTransform);
transformFolder
  .add(transformSettings, "rotationZ", -180, 180, 1)
  .name("Rotation Z")
  .onChange(updateObjectTransform);

transformFolder.open();

// Add Zoom Slider
const cameraSettings = {
  zoom: camera.zoom,
};

gui.add(cameraSettings, "zoom", 0.1, 10, 0.1)
  .name("Camera Zoom")
  .onChange((value) => {
    camera.zoom = value;
    camera.updateProjectionMatrix();
  });

const lightFolder = gui.addFolder('Lighting');
lightFolder.add(lightingSettings, 'type', [ 'DirectionalLight', 'AmbientLight', 'PointLight', 'SpotLight']).name('Light Type').onChange(updateLighting);
lightFolder.add(lightingSettings, 'intensity', 0.0, 20.0, 0.1).name('Light Intensity').onChange(updateLighting);
lightFolder.addColor(lightingSettings, 'color').name('Light Color').onChange(() => {
    updateLighting(); // Update the light in the scene
    if (asciiEffect) {
        const lightColorHex = `#${new THREE.Color(lightingSettings.color).getHexString()}`;
        asciiEffect.domElement.style.color = lightColorHex; // Update ASCII text color
   
    }

    if (filterSettings.filter === 'halftone') {
        updateHalftoneEffect();
    }
});
lightFolder.open();
}

// Update the updateLighting function to include the color change
function updateLighting() {
    // Remove the current light
    if (currentLight) {
        scene.remove(currentLight);
    }

    // Parse the selected color from the color picker
    const color = new THREE.Color(lightingSettings.color);

    // Add a new light based on the selected type
    switch (lightingSettings.type) {
  
        case 'DirectionalLight':
            currentLight = new THREE.DirectionalLight(color, lightingSettings.intensity);
            currentLight.position.set(5, 10, 20);
            break;
            case 'AmbientLight':
                currentLight = new THREE.AmbientLight(color, lightingSettings.intensity);
                break;
        case 'PointLight':
            currentLight = new THREE.PointLight(color, lightingSettings.intensity, 50);
            currentLight.position.set(5, 10, 20);
            break;
        case 'SpotLight':
            currentLight = new THREE.SpotLight(color, lightingSettings.intensity);
            currentLight.position.set(5, 10, 20);
            currentLight.angle = Math.PI / 6;
            currentLight.penumbra = 0.1;
            break;
    }


    // Add the new light to the scene
    scene.add(currentLight);

    // Update Halftone Shader Color
    updateHalftoneEffect();
}

// Initialize the scene with the lighting setup
setupLights();



function updateFilter(value) {
    // Remove the existing filter pass from the composer
    if (filterPass) {
        composer.removePass(filterPass);
    }
    switch (value) {
        case 'sepia':
            filterPass = new ShaderPass(SepiaShader);
            break;
        case 'film':
            filterPass = new FilmPass(0.35, false);
            break;
        case 'blackandwhite':
            filterPass = new FilmPass(0.35, true);
            break;
            case "halftone":
                filterPass = halftonePass;
                updateHalftoneEffect();
                break;
        default:
            filterPass = null;
            break;
    }


    if (filterPass) {
        composer.addPass(filterPass);
    }
}

// Fixing canvas initialization warning
const canvas = document.createElement("canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (asciiEffect) {
      asciiEffect.setSize(window.innerWidth, window.innerHeight);
    }
    if (composer) {
      composer.setSize(window.innerWidth, window.innerHeight);
    }
  };

  
  function animate() {
    requestAnimationFrame(animate);

        // Update camera information
        updateCameraInfo();

    if (asciiEffect && appContainer.contains(asciiEffect.domElement)) {
        asciiEffect.render(scene, camera);  // Render ASCII effect
    } else if (anaglyphEffect && appContainer.contains(anaglyphEffect.domElement)) {
        anaglyphEffect.render(scene, camera);  // Render Anaglyph effect
    } else {
        composer.render();  // Render other effects
    }
}