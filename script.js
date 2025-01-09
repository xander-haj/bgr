/***************************************
 * GLOBAL VARIABLES
 ***************************************/
const videoElement = document.getElementById("camera-feed");
const canvasElement = document.getElementById("output-canvas");
const ctx = canvasElement.getContext("2d");

// Default removal mode
let currentRemovalMode = "chroma";

// Custom background (image or video)
let customBackground = null;

// For performance: skip frames
let frameSkipValue = 0;
let frameCount = 0;

// Stream constraints
let currentStream = null;

/***************************************
 * THEME TOGGLE HANDLER
 ***************************************/
const themeToggleBtn = document.getElementById("theme-toggle");
const iconSun = document.getElementById("icon-sun");
const iconMoon = document.getElementById("icon-moon");

// Toggle the dark theme
themeToggleBtn.addEventListener("click", () => {
  document.documentElement.classList.toggle("dark-theme");
  // Save to localStorage
  if (document.documentElement.classList.contains("dark-theme")) {
    localStorage.setItem("theme", "dark");
    iconSun.classList.add("hide");
    iconMoon.classList.remove("hide");
  } else {
    localStorage.setItem("theme", "light");
    iconSun.classList.remove("hide");
    iconMoon.classList.add("hide");
  }
});

// Initialize theme icons on load
window.addEventListener("DOMContentLoaded", () => {
  if (document.documentElement.classList.contains("dark-theme")) {
    iconSun.classList.add("hide");
    iconMoon.classList.remove("hide");
  } else {
    iconSun.classList.remove("hide");
    iconMoon.classList.add("hide");
  }
});

/***************************************
 * VIDEOJS PLAYER INITIALIZATION
 ***************************************/
let player = null;

function initVideoJS(stream) {
  videoElement.srcObject = stream;
  if (!player) {
    player = videojs(videoElement, {
      autoplay: true,
      controls: false,
      muted: true,
      fluid: true,
    });
  }
}

/***************************************
 * CAMERA & RESOLUTION SELECTION
 ***************************************/
const cameraOptions = document.getElementById("camera-options");
const resolutionOptions = document.getElementById("resolution-options");

navigator.mediaDevices.enumerateDevices()
  .then((devices) => {
    const videoDevices = devices.filter((device) => device.kind === "videoinput");
    videoDevices.forEach((device) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Camera ${cameraOptions.length + 1}`;
      cameraOptions.add(option);
    });
  })
  .catch((err) => console.error("Error enumerating devices:", err));

async function startCamera(deviceId, resolution) {
  // Stop existing stream
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }

  const [width, height] = resolution.split("x").map(Number);
  const constraints = {
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: width },
      height: { ideal: height },
    },
    audio: false,
  };

  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    initVideoJS(currentStream);
  } catch (error) {
    console.error("Camera access denied:", error);
  }
}

// On change events
cameraOptions.addEventListener("change", () => {
  const deviceId = cameraOptions.value;
  const resolution = resolutionOptions.value;
  startCamera(deviceId, resolution);
});

resolutionOptions.addEventListener("change", () => {
  const deviceId = cameraOptions.value;
  const resolution = resolutionOptions.value;
  startCamera(deviceId, resolution);
});

/***************************************
 * FRAME PROCESSING LOOP
 ***************************************/
function startRealTimeProcessing() {
  function processFrame() {
    // Only draw if enough data is available
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      // Handle frame skipping for performance
      if (frameSkipValue > 0) {
        if (frameCount % (frameSkipValue + 1) === 0) {
          drawAndProcess();
        }
      } else {
        drawAndProcess();
      }
      frameCount++;
    }
    requestAnimationFrame(processFrame);
  }

  processFrame();
}

function drawAndProcess() {
  // Draw the current video frame to the canvas
  ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

  // Depending on removal mode, call respective function
  if (currentRemovalMode === "chroma") {
    chromaKeyRemoval(canvasElement);
  } else if (currentRemovalMode === "ai") {
    aiBackgroundRemoval(canvasElement);
  }

  // Overlay custom background if provided
  if (customBackground) {
    replaceBackground(canvasElement, customBackground);
  }
}

/***************************************
 * CHROMA KEY REMOVAL
 ***************************************/
function chromaKeyRemoval(canvas) {
  const src = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
  const dst = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
  const cap = cv.imread(canvas);
  cap.copyTo(src);

  // Convert the color into Scalar from the color input
  const colorInput = document.getElementById("chroma-color").value;
  const colorRGB = hexToRgb(colorInput); 
  // Tweak the thresholds to your specific color range
  const lowerBound = new cv.Mat(src.rows, src.cols, src.type(), [
    colorRGB.r - 40,
    colorRGB.g - 40,
    colorRGB.b - 40,
    255
  ]);
  const upperBound = new cv.Mat(src.rows, src.cols, src.type(), [
    colorRGB.r + 40,
    colorRGB.g + 40,
    colorRGB.b + 40,
    255
  ]);
  
  const mask = new cv.Mat();
  cv.inRange(src, lowerBound, upperBound, mask);

  // Invert the mask to keep the subject
  cv.bitwise_not(mask, mask);

  cv.bitwise_and(src, src, dst, mask);
  cv.imshow(canvas, dst);

  // Cleanup
  src.delete();
  dst.delete();
  cap.delete();
  mask.delete();
  lowerBound.delete();
  upperBound.delete();
}

// Helper: Convert hex color to RGB
function hexToRgb(hex) {
  const trimmed = hex.replace("#", "");
  const bigint = parseInt(trimmed, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

/***************************************
 * AI-BASED BACKGROUND REMOVAL
 ***************************************/
async function aiBackgroundRemoval(canvas) {
  // NOTE: This sample code uses a hypothetical U2Net model for demonstration
  // Replace the path with your actual ONNX model and verify it works in OpenCV.js
  const MODEL_URL = "https://mycdn.com/models/u2net.onnx";

  try {
    const net = cv.dnn.readNetFromONNX(MODEL_URL);

    // Prepare input
    let src = cv.imread(canvas);
    let blob = cv.dnn.blobFromImage(
      src,
      1.0 / 255.0,
      new cv.Size(320, 320),
      new cv.Scalar(0, 0, 0, 0),
      true,
      false
    );
    net.setInput(blob);
    let output = net.forward();
    
    let mask = new cv.Mat(output.size[2], output.size[3], cv.CV_32F, output.data32F);
    // Convert to 8-bit for thresholding
    let mask8U = new cv.Mat();
    mask.convertTo(mask8U, cv.CV_8U, 255);
    
    // Threshold to create binary mask
    cv.threshold(mask8U, mask8U, 128, 255, cv.THRESH_BINARY);

    // Convert mask to 3 channel
    let mask3c = new cv.Mat();
    cv.cvtColor(mask8U, mask3c, cv.COLOR_GRAY2RGBA);

    // Bitwise AND to keep only the subject
    let dst = new cv.Mat();
    cv.bitwise_and(src, mask3c, dst);
    
    cv.imshow(canvas, dst);

    // Cleanup
    src.delete();
    blob.delete();
    output.delete();
    mask.delete();
    mask8U.delete();
    mask3c.delete();
    dst.delete();
  } catch (err) {
    console.error("AI-based removal failed:", err);
  }
}

/***************************************
 * CUSTOM BACKGROUND REPLACEMENT
 ***************************************/
function replaceBackground(canvas, background) {
  const tempCtx = canvas.getContext("2d");
  // Save current frame
  const frameData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);

  // First draw the background
  tempCtx.globalCompositeOperation = "source-over";
  tempCtx.clearRect(0, 0, canvas.width, canvas.height);
  tempCtx.drawImage(background, 0, 0, canvas.width, canvas.height);

  // Then overlay the video subject
  tempCtx.globalCompositeOperation = "source-atop";
  tempCtx.putImageData(frameData, 0, 0);

  // Reset composite mode
  tempCtx.globalCompositeOperation = "source-over";
}

/***************************************
 * EVENT LISTENERS FOR REMOVAL MODE
 ***************************************/
document.getElementById("chroma-remove").addEventListener("click", () => {
  currentRemovalMode = "chroma";
});

document.getElementById("ai-remove").addEventListener("click", () => {
  currentRemovalMode = "ai";
});

/***************************************
 * CUSTOM BACKGROUND UPLOAD
 ***************************************/
document
  .getElementById("background-upload")
  .addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        customBackground = img;
      };
    } else if (file.type.startsWith("video/")) {
      const bgVideo = document.createElement("video");
      bgVideo.src = URL.createObjectURL(file);
      bgVideo.loop = true;
      bgVideo.muted = true;
      bgVideo.play();
      customBackground = bgVideo;
    }
  });

document.getElementById("apply-background").addEventListener("click", () => {
  // If user has selected a file, it is stored in customBackground
  // The background is applied during the real-time processing loop
});

/***************************************
 * EXPORT PROCESSED VIDEO
 ***************************************/
document.getElementById("export-video").addEventListener("click", () => {
  exportVideo(canvasElement);
});

function exportVideo(canvas) {
  // Here we do a quick "canvas to Blob" approach. Real video export
  // typically requires a library like MediaRecorder or ffmpeg.js.
  canvas.toBlob(
    (blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "processed-video.png"; // Quick fallback as PNG
      // For real MP4/webm, more advanced approach is needed.
      a.click();
    },
    "image/png",
    1
  );
}

/***************************************
 * FLOATING CONTROL BUTTONS
 ***************************************/

// Play / Pause
document.getElementById("play-pause").addEventListener("click", () => {
  if (!player) return;
  if (player.paused()) {
    player.play();
  } else {
    player.pause();
  }
});

// Stop Video
document.getElementById("stop-video").addEventListener("click", () => {
  if (!player) return;
  player.pause();
  player.currentTime(0);
});

// Cut Video (Placeholder for demonstration)
document.getElementById("cut-video").addEventListener("click", () => {
  // Implement cutting logic if needed
  alert("Cut video at current frame. (Demo function)");
});

// Trim Video (Placeholder for demonstration)
document.getElementById("trim-video").addEventListener("click", () => {
  // Implement trimming logic if needed
  alert("Trim video from start to end range. (Demo function)");
});

/***************************************
 * PERFORMANCE SETTINGS
 ***************************************/
const frameSkipInput = document.getElementById("frame-skip");
frameSkipInput.addEventListener("input", () => {
  frameSkipValue = parseInt(frameSkipInput.value, 10);
});

/***************************************
 * ON LOAD INIT
 ***************************************/
window.addEventListener("load", () => {
  // Start with default camera & resolution
  startCamera(undefined, resolutionOptions.value);
  // Start the real-time processing loop
  startRealTimeProcessing();
});
