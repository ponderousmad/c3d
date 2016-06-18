var C3D = (function () {
    "use strict";
    
    function View() {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = true;
        this.updateInterval = null;
        this.meshes = null;
        this.program = null;
        this.yAxisAngle = 0;
        this.xAxisAngle = 0;
        this.direction = 1;
        this.maxAutoAngleY = Math.PI / 40;
        this.maxAngleY = Math.PI / 4;
        this.maxAngleX = Math.PI / 8;
        this.distance = 8000;
        this.fill = true;
        this.stretch = false;
        this.iPadMiniBackCameraFOV = 28;
        this.lastImage = null;
        this.lastOrbit = null;
    }
    
    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        if (keyboard.wasAsciiPressed("S")) {
            this.stretch = !this.stretch;
            this.showImage(this.lastImage);
        }
        
        if (keyboard.wasAsciiPressed("F")) {
            this.fill = !this.fill;
            if (!this.stretch) {
                this.showImage(this.lastImage);
            }
        }
        
        if (keyboard.wasKeyPressed(IO.KEYS.Space)) {
            if (this.direction) {
                this.direction = 0;
            } else {
                this.direction = this.yAxisAngle < 0 ? 1 : -1;
            }
        }
        
        if (keyboard.wasAsciiPressed("R")) {
            this.yAxisAngle = 0;
            this.xAxisAngle = 0;
        }
        
        var deltaX = 0,
            deltaY = 0,
            rate = 0.001;
        
        if (pointer.activated()) {
            this.direction = 0;
        } else if (this.lastOrbit && pointer.primary) {
            deltaX = pointer.primary.x - this.lastOrbit.x;
            deltaY = pointer.primary.y - this.lastOrbit.y;
            rate = 0.0001;
        }
        
        if (pointer.primary) {
            this.lastOrbit = pointer.primary;
        }
        
        if (this.direction) {
            this.yAxisAngle += elapsed * 0.00002 * this.direction;
            if (Math.abs(this.yAxisAngle) > this.maxAutoAngleY && (this.direction < 0 == this.yAxisAngle < 0)) {
                this.yAxisAngle = this.direction * this.maxAutoAngleY;
                this.direction = -this.direction;
            }
        } else {
            if (keyboard.isKeyDown(IO.KEYS.Left)) {
                deltaX = -1;
            } else if(keyboard.isKeyDown(IO.KEYS.Right)) {
                deltaX = 1;
            }
            if (keyboard.isKeyDown(IO.KEYS.Up)) {
                deltaY = -1;
            } else if(keyboard.isKeyDown(IO.KEYS.Down)) {
                deltaY = 1;
            }
            
            if (keyboard.isShiftDown()) {
                rate *= 0.1;
            }
        }
        this.yAxisAngle = Math.min(this.maxAngleY, Math.max(-this.maxAngleY, this.yAxisAngle + deltaX * rate));
        this.xAxisAngle = Math.min(this.maxAngleX, Math.max(-this.maxAngleX, this.xAxisAngle + deltaY * rate));
    };
    
    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        if (this.program === null) {
            var shader = room.programFromElements("vertex-test", "fragment-test");
            this.program = {
                shader: shader,
                vertexPosition: room.bindVertexAttribute(shader, "aPos"),
                vertexUV: room.bindVertexAttribute(shader, "aUV"),
                textureVariable: "uSampler"
            };
            room.viewer.far = 100000;
            room.viewer.position.set(0, 0, this.distance);
            room.viewer.fov = this.iPadMiniBackCameraFOV;
            room.gl.enable(room.gl.CULL_FACE);
        }
        var yQ = R3.angleAxisQ(new R3.V(0, 1, 0), this.yAxisAngle),
            xQ = R3.angleAxisQ(new R3.V(1, 0, 0), this.xAxisAngle);
        
        
        room.viewer.orientation = R3.qmul(xQ, yQ);
        room.setupView(this.program.shader, "uMVMatrix", "uPMatrix");
        
        if (this.meshes !== null) {
            for (var m = 0; m < this.meshes.length; ++m) {
                room.drawMesh(this.meshes[m], this.program);   
            }
        }
    };
    
    View.prototype.loadImage = function (event) {
        var image = new Image();
        image.src = event.target.result;
        
        this.showImage(image);
    };
     
    View.prototype.showImage = function(image) {
        var scene = IMPROC.processImage(image);
        scene.cleanDepths = IMPROC.mipmapImputer(
            scene.depths, scene.width, scene.height, IMPROC.strategies.avg
        );
        
        var cleanSize = IMPROC.nextPowerOfTwo(Math.max(scene.height, scene.width));
        scene.uMax = scene.width / cleanSize;
        scene.vMax = scene.height / cleanSize;
        
        var canvas = document.createElement('canvas'),
            context = canvas.getContext('2d');
    
        canvas.width = cleanSize;
        canvas.height = cleanSize;
        context.drawImage(image, 0, 0);
        
        this.meshes = this.constructGrid(scene, this.stretch, this.fill);
        for (var m = 0; m < this.meshes.length; ++m) {
            this.meshes[m].image = canvas;
        }
        this.lastImage = image;
    };
    
    function calculateVertex(mesh, parameters, x, y, depth) {
        var pixel = R3.newPoint(parameters.xOffset + x, parameters.yOffset - y, -parameters.planeDistance);
        pixel.normalize();
        var normal = pixel.copy();
        pixel.scale(depth * parameters.depthScale);
        pixel.z += parameters.depthOffset;
        mesh.addVertex(pixel, normal, x * parameters.uScale, y * parameters.vScale);
    }
    
    function addTris(mesh, index, stride) {
        mesh.addTri(index,    index + stride, index + 1);
        mesh.addTri(index + 1,index + stride, index + stride + 1);
    }
    
    View.prototype.constructGrid = function (scene, stretch, fill) {
        var height = scene.height,
            width = scene.width,
            xStride = 1,
            yStride = 1,
            halfFOV = (this.iPadMiniBackCameraFOV / 2) * Math.PI / 180,
            indexStride = stretch ? 1 + (width / xStride) : 2,
            parameters = {
                xOffset: - width / 2,
                yOffset: height / 2,
                depthScale: 1,
                depthOffset: this.distance,
                uScale: scene.uMax / scene.width,
                vScale: scene.vMax / height,
                planeDistance: (scene.width / 2) / Math.tan(halfFOV)
            },
            MAX_INDEX = Math.pow(2, 16),
            vertex_count = (stretch ? 1 : 4) * (height + 1) * (width + 1),
            chunks = 2 * Math.ceil(vertex_count / (2 * MAX_INDEX)),
            rowsPerChunk = height / chunks,
            mesh = null,
            meshes = [],
            depths = stretch || fill ? scene.cleanDepths : scene.depths;

        for (var y = 0; y <= height; y += yStride) {
            var oldMesh = null,
                generateTris = y < height;
            if (generateTris && (y % rowsPerChunk) === 0) {
                oldMesh = mesh;
                mesh = new WGL.Mesh();
                meshes.push(mesh);
            }
            for (var x = 0; x <= width; x += xStride) {
				var depth = depths[Math.min(height - 1, y) * scene.width + Math.min(scene.width - 1, x)],
                    index = mesh.index;
                
                if (depth === null) {
                    continue;
                }
                
                if (stretch) {
                    calculateVertex(mesh, parameters, x, y, depth);
                } else {
                    for (var yi = y; yi <= y+1; ++yi) {
                        for (var xi = x; xi <= x+1; ++xi) {
                            calculateVertex(mesh, parameters, xi, yi, depth);
                        }
                    }
                }
                if ((generateTris && x < width) || !stretch) {
                    addTris(mesh, index, indexStride);
                }
			}
            
            if (oldMesh && stretch) {
                oldMesh.appendVerticies(mesh);
            }
		}
        
        return meshes;
    };
    
    window.onload = function(e) {
        MAIN.runTestSuites();
        var canvas = document.getElementById("canvas3D"),
            view = new View(),
            batch = new BLIT.Batch("images/");
        
        batch.load("test.png", function(image) {view.showImage(image);});
        batch.commit();
        
        MAIN.start(canvas, view);

        // Show the copy icon when dragging over. Seems to only work for chrome.
        canvas.addEventListener('dragover', function(e) {
            e.stopPropagation();
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        // Get file data on drop
        canvas.addEventListener('drop', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var files = e.dataTransfer.files;
            if (files.length == 1) {
                var file = files[0];
                if (file.type.match(/image.*/)) {
                    var reader = new FileReader();
                    reader.onload = function(loadEvent) { view.loadImage(loadEvent); };
                    reader.readAsDataURL(file); // start reading the file data.
                }
            }
        });
    };
    
    return {
    };
}());
