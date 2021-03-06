var C3D = (function () {
    "use strict";

    function View() {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = true;
        this.updateInterval = null;
        this.consumeKeys = true;
        this.canvasInputOnly = true;
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
        this.attitude = null;
        this.showCompass = false;
        this.fill = true;
        this.stitchMode = "smart";
        this.iPadMiniBackCameraFOV = 56;
        this.lastImage = null;
        this.lastOrbit = null;
        this.vrToggleIDs = { enter: "enterVR", exit: "exitVR" };
        this.room = null;
        this.eyeHeight = 0.25;

        this.fillCheckbox = document.getElementById("fill");
        this.turntableCheckbox = document.getElementById("turntable");
        this.stitchCombo = document.getElementById("stitch");

        this.headingSlider = document.getElementById("heading");
        this.tiltSlider = document.getElementById("tilt");
        this.twistSlider = document.getElementById("twist");
        this.headingValue = document.getElementById("headingDeg");
        this.tiltValue = document.getElementById("tiltDeg");
        this.twistValue = document.getElementById("twistDeg");

        this.batch = new BLIT.Batch("/captures/");

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
            self.showImage(self.lastImage, false);
        });

        function setupAngle(slider, value, offset) {
            function handleSlider() {
                self.attitude.euler.z = slider.value * R2.DEG_TO_RAD + (offset || 0);
                self.updateAttitudeUI(false);
            }
            slider.addEventListener("input", handleSlider);
            value.addEventListener("change", function (e) {
                slider.value = value.value;
                handleSlider();
            });
        }

        setupAngle(this.headingSlider, this.headingValue);
        setupAngle(this.tiltSlider, this.tiltValue, -Math.PI * 0.5);
        setupAngle(this.twistSlider, this.twistValue);
    }

    View.prototype.setRoom = function (room) {
        this.room = room;
    };

    View.prototype.updateAttitudeUI = function (updateSliders) {
        if (!this.headingSlider || !this.tiltSlider || !this.twistSlider) {
            return;
        }
        if (updateSliders) {
            this.headingSlider.value = this.attitude.euler.z * R2.RAD_TO_DEG;
            this.tiltSlider.value = (this.attitude.euler.x + Math.PI * 0.5) * R2.RAD_TO_DEG;
            this.twistSlider.value = this.attitude.euler.y * R2.RAD_TO_DEG;
        }

        if (!this.headingValue || !this.tiltValue || !this.twistValue) {
            return;
        }
        this.headingValue.value = this.headingSlider.value;
        this.tiltValue.value = this.tiltSlider.value;
        this.twistValue.value = this.twistSlider.value;
    };

    View.prototype.updateFill = function () {
        if (this.stitchMode != "simple") {
            this.showImage(this.lastImage, false);
        } else {
            this.updateControls();
        }
    };

    View.prototype.resetView = function () {
        this.yAxisAngle = 0;
        this.xAxisAngle = 0;
        this.distance = this.imageDistance;
        if (this.room) {
            this.room.viewer.resetPose();
        }
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
            this.showImage(this.lastImage, false);
        }

        if (keyboard.wasAsciiPressed("F")) {
            this.fill = !this.fill;
            this.updateFill();
        }

        if (keyboard.wasAsciiPressed("C")) {
            this.showCompass = !this.showCompass;
            if (this.showCompass && this.meshes) {
                this.meshes.pop();
                if (this.attitude) {
                    this.attitude.quaternion.w *= -1;
                }
                this.meshes.push(this.constructCompass());
            }
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

        if (keyboard.wasKeyPressed(IO.KEYS.Space)) {
            this.showRandomImage();
        }

        var deltaX = 0,
            deltaY = 0,
            rate = 0.0001;

        if (pointer.wheelY) {
            var WHEEL_BASE = 20;
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

    View.prototype.levelMatrix = function (pivot, inverse, useHeading) {
        var m = R3.identity();
        if (this.attitude && this.attitude.validEuler && this.attitude.pitch !== 0) {
            var heading = this.attitude.euler.z,
                tilt = this.attitude.euler.x + (Math.PI * 0.5),
                twist = this.attitude.euler.y;
            m.translate(R3.toOrigin(pivot));
            if (inverse) {
                m = R3.matmul(m, R3.makeRotateX(tilt));
                m = R3.matmul(m, R3.makeRotateZ(twist));
                if (useHeading) {
                    m = R3.matmul(m, R3.makeRotateY(-heading));
                }
            } else {
                if (useHeading) {
                    m = R3.matmul(m, R3.makeRotateY(-heading));
                }
                m = R3.matmul(m, R3.makeRotateZ(-twist));
                m = R3.matmul(m, R3.makeRotateX( -tilt));
            }
            m.translate(pivot);
        }
        return m;
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
            room.viewer.far = 20;
            room.viewer.fov = this.iPadMiniBackCameraFOV;
            room.gl.enable(room.gl.CULL_FACE);
        }
        if (room.viewer.inVR()) {
            var vrFrame = room.viewer.vrFrame(),
                pivot = new R3.V(0, 0, this.eyeHeight),
                m = this.levelMatrix(pivot);
            room.viewer.orientation.set(0, 0, 0, 1);
            room.viewer.position.set(0, 0, 0);

            m.translate(R3.toOrigin(pivot));
            m = R3.matmul(R3.makeRotateQ(R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0)), m);
            m.translate(new R3.V(0, 0, this.distance - this.center.z));

            var eyes = ["left", "right"],
                views = [vrFrame.leftViewMatrix, vrFrame.rightViewMatrix];
            for (var e = 0; e < eyes.length; ++e) {
                var viewMatrix = R3.matmul(new R3.M(views[e]), m);
                room.setupView(this.program.shader, eyes[e], "uMVMatrix", "uPMatrix", viewMatrix, vrFrame);
                this.drawMeshes(room);
            }
            room.viewer.submitVR();
        }
        if (room.viewer.showOnPrimary()) {
            room.viewer.orientation = R3.eulerToQ(this.xAxisAngle, this.yAxisAngle, 0);
            var offset = R3.makeRotateQ(room.viewer.orientation).transformP(this.center);
            room.viewer.position = R3.addVectors(offset, new R3.V(0, 0, -this.distance));
            room.setupView(this.program.shader, "safe", "uMVMatrix", "uPMatrix");
            this.drawMeshes(room);
        }
    };

    View.prototype.drawMeshes = function (room) {
        if (this.meshes !== null) {
            for (var m = 0; m < this.meshes.length - (this.showCompass ? 0 : 1); ++m) {
                room.drawMesh(this.meshes[m], this.program);
            }
        }
    };

    View.prototype.loadImage = function (event) {
        var image = new Image();
        image.src = event.target.result;
        this.showImage(image, true);
    };

    View.prototype.showImage = function(image, resetDistance) {
        this.updateControls();

        var scene = IMPROC.processImage(image);
        scene.cleanDepths = IMPROC.mipmapImputer(
            scene.depths, scene.width, scene.height, IMPROC.strategies.avg
        );

        var cleanSize = IMPROC.nextPowerOfTwo(Math.max(scene.imageHeight, scene.imageWidth));
        scene.uMax = scene.imageWidth / cleanSize;
        scene.vMax = scene.imageHeight / cleanSize;

        var canvas = document.createElement('canvas'),
            context = canvas.getContext('2d'),
            thirdWidth = cleanSize / 3,
            compassHeight = Math.ceil(cleanSize / 10);

        canvas.width = cleanSize;
        canvas.height = cleanSize;
        context.fillStyle = "white";
        context.fillRect(0, 0, cleanSize, cleanSize);

        // Compass textures.
        context.fillStyle = "red";
        context.fillRect(0, cleanSize - compassHeight, thirdWidth, compassHeight);
        context.fillStyle = "green";
        context.fillRect(thirdWidth, cleanSize - compassHeight, thirdWidth, compassHeight);
        context.fillStyle = "blue";
        context.fillRect(thirdWidth * 2, cleanSize - compassHeight, thirdWidth, compassHeight);

        context.drawImage(image, 0, 0);

        this.meshes = this.constructGrid(scene, this.stitchMode, this.fill);
        var bbox = new R3.AABox();
        for (var m = 0; m < this.meshes.length; ++m) {
            var mesh = this.meshes[m];
            mesh.image = canvas;
            bbox.envelope(mesh.bbox);
        }
        this.attitude = scene.attitude;

        this.updateAttitudeUI(true);

        this.center = bbox.center();
        console.log(bbox);
        this.center.setAt(0, 0);
        this.center.setAt(1, 0);
        this.meshes.push(this.constructCompass());
        this.lastImage = image;
        this.imageDistance = this.center.z;
        if (resetDistance) {
            console.log("Reset distance");
            this.distance = this.imageDistance;
        }
    };

    View.prototype.batchLoadImage = function (image) {
        var self = this;
        this.batch.load(image, function(image) { self.showImage(image, true); });
        this.batch.commit();
    };

    View.prototype.showRandomImage = function () {
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
        var self = this;

        this.batch.load(encodeURIComponent(file), function(image) { self.showImage(image, true); });
        this.batch.commit();
    };

    function calculateVertex(mesh, parameters, x, y, depth) {
        var pixel = new R3.V(
            depth * (parameters.xOffset + x) / parameters.xFactor,
            depth * (parameters.yOffset - y) / parameters.yFactor,
            -depth
        );
        var normal = pixel.normalized();
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
            yStride = xStride,
            rowIndexWidth = 1 + (width / xStride),
            indexStride = stitch == "simple" ? rowIndexWidth : 2,
            depthScale = 1,
            pixelFOV = this.iPadMiniBackCameraFOV * R2.DEG_TO_RAD / scene.width,

            parameters = {
                // Following is from http://forums.structure.io/t/getting-colored-point-cloud-data-from-aligned-frames/4094
                // Assume the following intrinsics, from the Structure SDK docs
                // K_RGB_QVGA       = [305.73, 0, 159.69; 0, 305.62, 119.86; 0, 0, 1]
                // Since those numbers are for 320x240, just multiply by 2.
                xOffset:-159.69 * 2,
                yOffset: 119.86 * 2,
                xFactor: 305.73 * 2,
                yFactor: 305.62 * 2,
                uScale: scene.uMax / width,
                vScale: scene.vMax / height
            },
            MAX_INDEX = Math.pow(2, 16),
            SMART_STITCH_MAX_DIFFERENCE = 0.15,
            SMART_STITCH_DIFFERENCE_THRESHOLD = 0.05,
            pixelIndexStride = (stitch == "simple" ? 1 : 4),
            rowVertexCount = pixelIndexStride * ((width / xStride) + 1),
            rowsPerChunk = Math.floor(MAX_INDEX / rowVertexCount) - 1,
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

    View.prototype.constructCompass = function () {
        var mesh = new WGL.Mesh(),
            up = new R3.V(0, 1,  0),
            down = new R3.V(0, -1, 0),
            points = [
                new R3.V(-0.01, 0, -0.01),
                new R3.V(-0.01, 0,  0.01),
                new R3.V( 0.01, 0,  0.01),
                new R3.V( 0.01, 0, -0.01),
                new R3.V( 0.00, 1,  0.00)
            ],
            tris = [
                [0, 3, 1],
                [3, 2, 1],
                [0, 1, 4],
                [1, 2, 4],
                [2, 3, 4],
                [3, 0, 4]
            ],
            uvs = [
                [0.00, 0.00],
                [0.00, 0.01],
                [0.01, 0.01],
                [0.01, 0.00],
                [0.005,0.005]
            ],
            uOffsets = [0.1, 0.5, 0.9],
            vOffset = 0.98,
            axes = [
                R3.angleAxisQ(Math.PI * 0.5, new R3.V(0, 0, 1)),
                new R3.Q(),
                R3.angleAxisQ(-Math.PI * 0.5, new R3.V(1, 0, 0))
            ],
            level = this.levelMatrix(R3.origin(), true, true);

        for (var a = 0; a < axes.length; ++a) {
            var transform = R3.matmul(level, R3.makeRotateQ(axes[a]));

            up = transform.transformV(up);
            down = transform.transformV(down);
            for (var p = 0; p < points.length; ++p) {
                var point = transform.transformP(points[p]),
                    u = uvs[p][0] + uOffsets[a],
                    v = uvs[p][1] + vOffset;
                mesh.addVertex(point, p == 4 ? up : down, u, v);
            }
            var iOffset = a * points.length;
            for (var t = 0; t < tris.length; ++t) {
                mesh.addTri(
                    tris[t][0] + iOffset,
                    tris[t][1] + iOffset,
                    tris[t][2] + iOffset
                );
            }
        }
        return mesh;
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
        var canvas = document.getElementById("canvas3D"),
            controls = document.getElementById("controls"),
            menuButton = document.getElementById("menuButton"),
            fileUpload = document.getElementById("fileUpload"),
            randomButton = document.getElementById("random"),
            resetButton = document.getElementById("reset"),
            resultsCombo = document.getElementById("results"),
            controlsVisible = false,
            view = new View(),
            query = location.search,
            image = getQueryParameter(query, "image");
        view.fill = getQueryParameter(query, "fill", "1") == "1";

        canvas.tabIndex = 1000; // Hack to get canvas to accept keyboard input.
        view.inputElement = canvas;

        var room = MAIN.start(canvas, view);
        view.setRoom(room);

        // Show the copy icon when dragging over. Seems to only work for chrome.
        canvas.addEventListener("dragover", function(e) {
            e.stopPropagation();
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });

        function loadImage(file) {
            if (file.type.match(/image.*/)) {
                resultsCombo.value = "";
                var reader = new FileReader();
                reader.onload = function(loadEvent) { view.loadImage(loadEvent); };
                reader.readAsDataURL(file); // start reading the file data.
            }
        }

        if (image) {
            view.batchLoadImage(image);
        } else {
            view.showRandomImage();
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
            e.preventDefault = true;
            return false;
        });

        randomButton.addEventListener("click", function(e) {
            resultsCombo.value = "";
            view.showRandomImage();
        });

        resetButton.addEventListener("click", function(e) {
            view.resetView();
        });

        resultsCombo.addEventListener("change", function (e) {
            if (resultsCombo.value) {
                var resultsBatch = new BLIT.Batch("images/");
                resultsBatch.load(resultsCombo.value, function(image) { view.showImage(image, true); });
                resultsBatch.commit();
            }
        });

        MAIN.runTestSuites();
    };

    return {
    };
}());
