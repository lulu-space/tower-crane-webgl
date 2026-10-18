// ================= GLOBAL VARIABLES =================
let armRotation = 0;              // Current rotation angle of crane arm
let baseOffset = 0;               // Sideways offset of the base (draggable)
let direction = 1;                // Base movement direction multiplier (1 normal, -1 reverse)
let useOrtho = false;             // Projection mode: false=Perspective, true=Orthographic

// Load object attached to hook
let loadPosition = { x: 0, y: -1, z: 0 }; // Relative position of load to hook
let loadHeld = true;                       // Whether the hook is holding the load
let hookDropDirection = 1;                 // Direction of load movement when dropped (1=right, -1=left)

// Optional animation controls
let isPlaying = true;            // Whether animation is running
let speed = 1.0;                 // Speed multiplier for arm rotation and other animations

// WebGL setup
const { mat4, vec3, mat3 } = glMatrix;      // glMatrix utilities
const canvas = document.getElementById("glcanvas");     
const gl = canvas.getContext("webgl");      // WebGL context

// ================= UI CONTROLS =================
document.getElementById("toggleAnim").onclick = () => {
  isPlaying = !isPlaying;                       // Toggle animation play/pause
  document.getElementById("toggleAnim").innerText =
    isPlaying ? "Pause" : "Play";
};

document.getElementById("speed").oninput = (e) => {
  speed = parseFloat(e.target.value);          // Adjust animation speed
};

document.getElementById("toggleDir").onclick = () => {
  direction *= -1;                             // Reverse direction of base/arm
};

// ================= DRAGGING =================
let isDragging = false;                         // Tracks whether mouse is dragging
let lastMouseX = 0;                             // Last X position of mouse
let dragSpeed = 0.05;                           // Sensitivity of drag movement

canvas.addEventListener("mousedown", e => {
  isDragging = true;                            // Start dragging
  lastMouseX = e.clientX;
});
canvas.addEventListener("mouseup", () => { isDragging = false; });
canvas.addEventListener("mouseleave", () => { isDragging = false; });

canvas.addEventListener("mousemove", e => {
  if (!isDragging) return;                      // Only move if dragging
  const dx = e.clientX - lastMouseX;
  baseOffset += dx * dragSpeed;                // Update base position
  baseOffset = Math.max(-5, Math.min(5, baseOffset)); // Clamp movement
  lastMouseX = e.clientX;
});

// Toggle projection button (Perspective / Orthographic)
document.getElementById("toggleProj").onclick = () => {
  useOrtho = !useOrtho;                        // Switch projection mode
  document.getElementById("toggleProj").innerText =
    useOrtho ? "Perspective" : "Orthographic";
  updateProjection();
};

// ================= WEBGL SETUP =================
if (!gl) alert("WebGL not supported");         // Alert if WebGL is unavailable

// Compile shader
function loadShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

// Create shader program
function createProgram(vsSource, fsSource) {
  const vs = loadShader(gl.VERTEX_SHADER, vsSource);
  const fs = loadShader(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return program;
}

// Load shaders and start main function
Promise.all([
  fetch("vertex.glsl").then(r => r.text()),
  fetch("fragment.glsl").then(r => r.text())
]).then(([vs, fs]) => start(vs, fs));

// Cube geometry (unit cube, 36 vertices for triangles)
const cubeVertices = new Float32Array([
  -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5,0.5,0.5,
  -0.5,-0.5,0.5,   0.5,0.5,0.5,   -0.5,0.5,0.5,
  -0.5,-0.5,-0.5, -0.5,0.5,-0.5,  0.5,0.5,-0.5,
  -0.5,-0.5,-0.5,  0.5,0.5,-0.5,  0.5,-0.5,-0.5,
  -0.5,-0.5,-0.5, -0.5,-0.5,0.5,  -0.5,0.5,0.5,
  -0.5,-0.5,-0.5, -0.5,0.5,0.5,  -0.5,0.5,-0.5,
   0.5,-0.5,-0.5,  0.5,0.5,-0.5,  0.5,0.5,0.5,
   0.5,-0.5,-0.5,  0.5,0.5,0.5,  0.5,-0.5,0.5,
  -0.5,0.5,-0.5, -0.5,0.5,0.5,  0.5,0.5,0.5,
  -0.5,0.5,-0.5,  0.5,0.5,0.5,  0.5,0.5,-0.5,
  -0.5,-0.5,-0.5,  0.5,-0.5,-0.5, 0.5,-0.5,0.5,
  -0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5
]);

// ================= MATRIX STACK =================
let stack = [];                                // Stack to store hierarchical transformations
const pushMatrix = m => stack.push(mat4.clone(m));
const popMatrix = () => stack.pop();

// ================= MAIN START FUNCTION =================
function start(vs, fs) {
  const program = createProgram(vs, fs);
  gl.useProgram(program);

  // Set viewport and background color
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.07, 0.10, 0.18, 1.0);       // dark background
  gl.enable(gl.DEPTH_TEST);                   // enable depth test

  // Upload cube vertices to GPU
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, cubeVertices, gl.STATIC_DRAW);

  // Link vertex positions
  const aPosition = gl.getAttribLocation(program, "aPosition");
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(aPosition);

  // Uniform locations
  const uModel = gl.getUniformLocation(program, "uModel");
  const uView = gl.getUniformLocation(program, "uView");
  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uColor = gl.getUniformLocation(program, "uColor");

  // Camera view matrix
  const view = mat4.create();
  mat4.lookAt(view, [0, 6, 20], [0, 3, 0], [0, 1, 0]);
  gl.uniformMatrix4fv(uView, false, view);

  // Projection matrix (Perspective by default)
  const proj = mat4.create();
  mat4.perspective(proj, Math.PI/4, canvas.width/canvas.height, 0.1, 100);
  gl.uniformMatrix4fv(uProjection, false, proj);

  // Base transformation
  let baseMatrix = mat4.create();

  // ================= DRAW LOOP =================
  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Update projection matrix if toggled
    function updateProjection() {
      if (useOrtho) {
        mat4.ortho(proj, -18, 18, -10, 6, 0.1, 100); // Orthographic bounds
      } else {
        mat4.perspective(proj, Math.PI/4, canvas.width/canvas.height, 0.1, 100);
      }
      gl.uniformMatrix4fv(uProjection, false, proj);
    }
    updateProjection();

    // ================= FLOOR =================
    let floor = mat4.create();
    mat4.translate(floor, floor, [0, -9, 0]);  // Place floor under base
    mat4.scale(floor, floor, [30.5, 0.1, 30]); // Floor dimensions
    gl.uniform4f(uColor, 0.18, 0.20, 0.25, 1.0); // Floor color
    gl.uniformMatrix4fv(uModel, false, floor);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // ================= SIDE WALL =================
    let wall = mat4.create();
    mat4.translate(wall, wall, [0, 4, -15]);   // Wall behind crane
    mat4.scale(wall, wall, [24.5, 20, -15]);   // Wall dimensions
    gl.uniform4f(uColor, 0.2, 0.3, 0.8, 0.5);  // Wall color
    gl.uniformMatrix4fv(uModel, false, wall);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // ================= ANIMATION =================
    if (isPlaying) {
      armRotation += 0.01 * speed * direction; // Rotate arm if playing
    }
    if (baseOffset > 3 || baseOffset < -3) direction *= -1; // Reverse direction at edges

    const armTilt = Math.sin(Date.now() * 0.002) * 0.05; // Small arm tilt animation

    let model = mat4.create();                   // Root coordinate system
    mat4.translate(model, model, [baseOffset, -3, 0]); // Base position

    // ================= BASE =================
    pushMatrix(model);
    mat4.scale(model, model, [2, 3.5, 2]);      // Base dimensions
    gl.uniform4f(uColor, 0.75, 0.75, 0.78, 1.0); // Base color
    gl.uniformMatrix4fv(uModel, false, model);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    model = popMatrix();

    // ================= TOWER =================
    pushMatrix(model);
    mat4.translate(model, model, [0, 4, 0]);    // Tower position
    mat4.scale(model, model, [0.5, 7, 0.5]);    // Tower dimensions
    gl.uniform4f(uColor, 0.9, 0.8, 0.2, 1.0);   // Tower color
    gl.uniformMatrix4fv(uModel, false, model);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // ================= ROTATING ARM =================
    pushMatrix(model);
    mat4.translate(model, model, [0,0.6,0]);    // Pivot position
    mat4.rotateY(model, model, armRotation);    // Left/right rotation
    mat4.rotateZ(model, model, armTilt);        // Up/down tilt

    // MAIN ARM
    pushMatrix(model);
    mat4.translate(model, model, [4,0,0]);
    mat4.scale(model, model, [8, 0.3, 0.3]);
    gl.uniform4f(uColor, 0.9, 0.5, 0.1, 1.0);
    gl.uniformMatrix4fv(uModel, false, model);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    model = popMatrix();

    // HOOK
    pushMatrix(model);
    mat4.translate(model, model, [7.8, -0.5, 0]);
    mat4.scale(model, model, [0.2, 1.0, 0.2]);
    gl.uniform4f(uColor, 0.1, 0.1, 0.1, 1);
    gl.uniformMatrix4fv(uModel, false, model);
    gl.drawArrays(gl.TRIANGLES, 0, 36);

    // LOAD (CHILD OF HOOK)
    pushMatrix(model);
    mat4.translate(model, model, [0, -0.7, 0]); // Position under hook
    mat4.scale(model, model, [5, 0.5, 5]);      // Load dimensions
    gl.uniform4f(uColor, 0.4, 0.4, 0.4, 1);    // Load color
    gl.uniformMatrix4fv(uModel, false, model);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
    model = popMatrix(); // pop load
    model = popMatrix(); // pop hook
    model = popMatrix(); // pop rotating arm
    model = popMatrix(); // pop tower

    requestAnimationFrame(draw);                // Loop draw function
  }

  draw(); // Start draw loop
}
