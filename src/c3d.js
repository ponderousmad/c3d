var C3D = (function () {
    "use strict";
    
    function View() {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = true;
        this.updateInterval = null;
        this.consumeKeys = true;
        this.meshes = null;
        this.program = null;
        this.yAxisAngle = 0;
        this.xAxisAngle = 0;
        this.direction = 0;
        this.maxAngleY = 90 * R2.DEG_TO_RAD;
        this.maxAngleX = this.maxAngleY;
        this.maxAutoAngleY = this.maxAngleY / 2;
        this.distance = 0;
        this.imageDistance = 0;
        this.center = R3.origin();
        this.fill = true;
        this.stitchMode = "smart";
        this.iPadMiniBackCameraFOV = 56;
        this.lastImage = null;
        this.lastOrbit = null;
        
        this.fillCheckbox = document.getElementById("fill");
        this.turntableCheckbox = document.getElementById("turntable");
        this.stitchCombo = document.getElementById("stitch");
        
        var self = this;
        
        this.fillCheckbox.addEventListener("change", function (e) {
            self.fill = self.fillCheckbox.checked;
            self.updateFill();
        });
        
        this.turntableCheckbox.addEventListener("change", function (e) {
            if (self.direction) {
                self.direction = 0;
            } else {
                self.direction = 1;
            }
        });
        
        this.stitchCombo.addEventListener("change", function (e) {
            self.stitchMode = self.stitchCombo.value;
            self.showImage(self.lastImage);
        });
    }
    
    View.prototype.updateFill = function () {
        if (this.stitchMode != "simple") {
            this.showImage(this.lastImage);
        } else {
            this.updateControls();
        }
    };
    
    View.prototype.resetView = function () {
        this.yAxisAngle = 0;
        this.xAxisAngle = 0;
        this.distance = this.imageDistance;
    };
    
    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        if (keyboard.wasAsciiPressed("S")) {
            if (this.stitchMode == "smart")  {
                this.stitchMode = "none";
            } else if (this.stitchMode == "simple") {
                this.stitchMode = "smart";
            } else {
                this.stitchMode = "simple";
            }
            this.showImage(this.lastImage);
        }
        
        if (keyboard.wasAsciiPressed("F")) {
            this.fill = !this.fill;
            this.updateFill();
        }
        
        if (keyboard.wasAsciiPressed("T")) {
            if (this.direction) {
                this.direction = 0;
            } else {
                this.direction = this.yAxisAngle < 0 ? 1 : -1;
            }
            this.updateControls();
        }
        
        if (keyboard.wasAsciiPressed("R")) {
            this.resetView();
        }
        
        var deltaX = 0,
            deltaY = 0,
            rate = 0.0001;
        
        if (pointer.wheelY) {
            var WHEEL_BASE = 1000;
            this.distance *= (WHEEL_BASE + pointer.wheelY) / WHEEL_BASE;
        }
        
        if (pointer.activated()) {
            //this.direction = 0;
        } else if (this.lastOrbit && pointer.primary) {
            deltaX = pointer.primary.x - this.lastOrbit.x;
            deltaY = pointer.primary.y - this.lastOrbit.y;
            if (deltaX || deltaY) {
                rate = 0.0025;
            }
        }
        
        if (pointer.primary) {
            this.lastOrbit = pointer.primary;
        }
   
        if (keyboard.isShiftDown()) {
            rate *= 10;
        } else if(keyboard.isAltDown()) {
            rate *= 0.1;
        }
        
        if (this.direction && !pointer.primary) {
            this.yAxisAngle += elapsed * rate * this.direction;
            if (Math.abs(this.yAxisAngle) > this.maxAutoAngleY && (this.direction < 0 == this.yAxisAngle < 0)) {
                this.yAxisAngle = this.direction * this.maxAutoAngleY;
                this.direction = -this.direction;
            }
        } else {
            if (keyboard.isKeyDown(IO.KEYS.Left)) {
                deltaX = -elapsed;
            } else if(keyboard.isKeyDown(IO.KEYS.Right)) {
                deltaX = elapsed;
            }
            if (keyboard.isKeyDown(IO.KEYS.Up)) {
                deltaY = -elapsed;
            } else if(keyboard.isKeyDown(IO.KEYS.Down)) {
                deltaY = elapsed;
            }
        }
        this.yAxisAngle = Math.min(this.maxAngleY, Math.max(-this.maxAngleY, this.yAxisAngle + deltaX * rate));
        this.xAxisAngle = Math.min(this.maxAngleX, Math.max(-this.maxAngleX, this.xAxisAngle + deltaY * rate));
    };
    
    View.prototype.updateControls = function () {
        this.fillCheckbox.checked = this.fill;
        this.turntableCheckbox.checked = this.direction !== 0;
        this.stitchCombo.value = this.stitchMode;
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
            room.viewer.fov = this.iPadMiniBackCameraFOV;
            room.gl.enable(room.gl.CULL_FACE);
        }

        if (this.meshes !== null) {
            room.viewer.orientation = R3.eulerQ(this.xAxisAngle, this.yAxisAngle, 0);
            var rotate = R3.makeRotateQ(room.viewer.orientation);
            room.viewer.position = R3.subVectors(this.center, rotate.transformV(new R3.V(0, 0, this.distance)));
            room.setupView(this.program.shader, "uMVMatrix", "uPMatrix");

            for (var m = 0; m < this.meshes.length; ++m) {
                room.drawMesh(this.meshes[m], this.program);   
            }
        }
    };
    
    View.prototype.loadImage = function (event) {
        var image = new Image();
        image.src = event.target.result;
        this.distance = 0;
        
        this.showImage(image);
    };
     
    View.prototype.showImage = function(image) {
        this.updateControls();
        
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
        
        this.meshes = this.constructGrid(scene, this.stitchMode, this.fill);
        var bbox = new R3.AABox();
        for (var m = 0; m < this.meshes.length; ++m) {
            var mesh = this.meshes[m];
            mesh.image = canvas;
            bbox.envelope(mesh.bbox);
        }
        this.center = bbox.center();
        console.log(bbox);
        this.center.setAt(0, 0);
        this.center.setAt(1, 0);
        this.lastImage = image;
        this.imageDistance = this.center.z;
        if (!this.distance) {
            this.distance = this.imageDistance;
        }
    };
    
    function calculateVertex(mesh, parameters, x, y, depth) {
        var pixel = R3.newPoint(parameters.xOffset + x, parameters.yOffset - y, -parameters.planeDistance);
        pixel.normalize();
        var normal = pixel.copy();
        pixel.scale(depth);
        pixel.z *= parameters.depthScale;
        mesh.addVertex(pixel, normal, x * parameters.uScale, y * parameters.vScale);
    }
    
    function addTris(mesh, index, stride) {
        mesh.addTri(index,    index + stride, index + 1);
        mesh.addTri(index + 1,index + stride, index + stride + 1);
    }
    
    function lookupDepth(depths, scene, x, y, height, width) {
        return depths[Math.min(height - 1, y) * scene.width + Math.min(scene.width - 1, x)];
    }
    
    View.prototype.constructGrid = function (scene, stitch, fill) {
        var height = scene.height,
            width = scene.width,
            xStride = 1,
            yStride = 1,
            rowIndexWidth = 1 + (width / xStride),
            indexStride = stitch == "simple" ? rowIndexWidth : 2,
            depthScale = 2 / scene.width,
            halfFOV = (this.iPadMiniBackCameraFOV * depthScale/ 2) * R2.DEG_TO_RAD,
            parameters = {
                xOffset: - width / 2,
                yOffset: height / 2,
                depthScale: depthScale,
                uScale: scene.uMax / scene.width,
                vScale: scene.vMax / height,
                planeDistance: 1 / (depthScale * Math.tan(halfFOV))
            },
            MAX_INDEX = Math.pow(2, 16),
            SMART_STITCH_MAX_DIFFERENCE = 150,
            SMART_STITCH_DIFFERENCE_THRESHOLD = 0.05,
            pixelIndexStride = (stitch == "simple" ? 1 : 4),
            vertexCount = pixelIndexStride * (height + 1) * (width + 1),
            chunks = 2 * Math.ceil(vertexCount / (2 * MAX_INDEX)),
            rowsPerChunk = height / chunks,
            mesh = null,
            meshes = [],
            depths = (stitch == "simple") || fill ? scene.cleanDepths : scene.depths;

        for (var y = 0; y <= height; y += yStride) {
            var oldMesh = null,
                generateTris = y < height;
            if (generateTris && (y % rowsPerChunk) === 0) {
                oldMesh = mesh;
                mesh = new WGL.Mesh();
                meshes.push(mesh);
            }
            for (var x = 0; x <= width; x += xStride) {
				var depth = lookupDepth(depths, scene, x, y, width, height),
                    index = mesh.index,
                    generateTri = (generateTris && x < width) || stitch == "none";
                
                if (depth === null) {
                    if (stitch == "smart") {
                        depth = lookupDepth(scene.cleanDepths, scene, x, y, width, height);
                        generateTri = false;
                    } else {
                        continue;
                    }
                }
                
                if (stitch=="simple") {
                    calculateVertex(mesh, parameters, x, y, depth);
                } else {
                    for (var yi = y; yi <= y+1; ++yi) {
                        for (var xi = x; xi <= x+1; ++xi) {
                            calculateVertex(mesh, parameters, xi, yi, depth);
                        }
                    }
                }
                
                if (stitch == "smart") {
                    if (generateTri) {
                        var iUL = 0, iUR = 1, iDL = 2, iDR = 3;
                        if (x < width && y < height) {
                            var depthR = lookupDepth(depths, scene, x + 1, y, width, height),
                                depthD = lookupDepth(depths, scene, x, y + 1, width, height),
                                depthDR= lookupDepth(depths, scene, x + 1, y + 1, width, height),
                                threshold = Math.min(SMART_STITCH_MAX_DIFFERENCE,
                                                     depth * SMART_STITCH_DIFFERENCE_THRESHOLD);

                            if (depthR !== null && Math.abs(depth-depthR) <= threshold) {
                                iUR = pixelIndexStride;
                            }
                            if (depthD !== null && Math.abs(depth-depthD) <= threshold) {
                                iDL = pixelIndexStride * rowIndexWidth;
                            }
                            if (depthDR !== null && Math.abs(depth-depthDR) <= threshold) {
                                iDR = pixelIndexStride * (1 + rowIndexWidth);
                            }
                        }
                        mesh.addTri(index + iUL, index + iDL, index + iUR);
                        mesh.addTri(index + iUR, index + iDL, index + iDR);
                    }
                } else if (generateTri) {
                    addTris(mesh, index, indexStride);
                }
			}
            
            if (oldMesh && stitch != "none") {
                oldMesh.appendVerticies(mesh);
            }
		}
        
        return meshes;
    };
    
    function getQueryParameter(query, parameter, defaultValue) {
        try {
            if (query) {
                var splitOnName = query.split(parameter + "=");
                if (splitOnName.length > 1) {
                    var splitOnAmpersand = splitOnName[1].split("&");
                    if (splitOnAmpersand.length > 0) {
                        return decodeURIComponent(splitOnAmpersand[0]);
                    }
                }
            }
        } catch(e) {
            console.log("Error Parsing Query: " + e);
        }
        return defaultValue;
    }
    
    window.onload = function(e) {
        MAIN.runTestSuites();
        var canvas = document.getElementById("canvas3D"),
            controls = document.getElementById("controls"),
            menuButton = document.getElementById("menuButton"),
            fileUpload = document.getElementById("fileUpload"),
            randomButton = document.getElementById("random"),
            resetButton = document.getElementById("reset"),
            controlsVisible = false,
            view = new View(),
            batch = new BLIT.Batch("/captures/"),
            query = location.search,
            image = getQueryParameter(query, "image");
        view.fill = getQueryParameter(query, "fill", "1") == "1";
        
        MAIN.start(canvas, view);

        // Show the copy icon when dragging over. Seems to only work for chrome.
        canvas.addEventListener("dragover", function(e) {
            e.stopPropagation();
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });
        
        function loadImage(file) {
            if (file.type.match(/image.*/)) {
                var reader = new FileReader();
                reader.onload = function(loadEvent) { view.loadImage(loadEvent); };
                reader.readAsDataURL(file); // start reading the file data.
            }
        }
        
        function showRandomImage() {
            var counts = [
                    ["noatt", 1275],
                    ["obj", 311],
                    ["hats", 250],
                    ["cap", 9400]
                ],
                fullList = [];
            for (var i = 0; i < counts.length; ++i) {
                var baseName = counts[i][0],
                    count = counts[i][1];
                for (var n = 1; n <= count; ++n) {
                    fullList.push(baseName + " - " + n + ".png");
                }
            }
            
            var file = ENTROPY.makeRandom().randomElement(fullList);
            console.log("Loading " + file);
            
            batch.load(encodeURIComponent(file), function(image) {view.showImage(image);});
            batch.commit();
        }
        
        if (image) {
            batch.load(image, function(image) {view.showImage(image);});
            batch.commit();
        } else {
            showRandomImage();
        }
        
        // Get file data on drop
        canvas.addEventListener("drop", function(e) {
            e.stopPropagation();
            e.preventDefault();
            var files = e.dataTransfer.files;
            if (files.length == 1) {
                loadImage(files[0]);
            }
        });
        
        fileUpload.addEventListener("change", function(e) {
            loadImage(fileUpload.files[0]);
        });
        
        menuButton.addEventListener("click", function(e) {
            controlsVisible = !controlsVisible;
            var slide = controlsVisible ? " slideIn" : "";
            controls.className = "controls" + slide;
        });
        
        randomButton.addEventListener("click", function(e) {
            showRandomImage();
        });
        
        resetButton.addEventListener("click", function(e) {
            view.resetView();
        });
    };
    
    return {
    };
}());
