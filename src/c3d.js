var C3D = (function () {
    "use strict";
    
    function View() {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = true;
        this.updateInterval = null;
        this.meshes = null;
        this.program = null;
        this.angle = 0;
        this.direction = 1;
        this.maxAngle = Math.PI / 40;
        this.distance = 8000;
        this.iPadMiniBackCameraFOV = 28;
    }
    
    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        this.angle += elapsed * 0.00002 * this.direction;
        if (Math.abs(this.angle) > this.maxAngle) {
            this.angle = this.direction * this.maxAngle;
            this.direction = -this.direction;
        }
    };
    
    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        room.viewer.setRotateY(this.angle);

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
            room.gl.disable(room.gl.CULL_FACE);
        }
        
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
        
        this.meshes = this.constructGrid(scene);
        for (var m = 0; m < this.meshes.length; ++m) {
            this.meshes[m].image = canvas;
        }
        this.angle = 0;
    };
    
    View.prototype.constructGrid = function (scene) {
        var height = scene.height,
            width = scene.width,
            xOffset = - width / 2,
            yOffset = height / 2,
            depthScale = 1,
            depthOffset = this.distance,
            uScale = scene.uMax / scene.width,
            vScale = scene.vMax / height,
            xStride = 1,
            yStride = 1,
            widthSteps = width / xStride,
            halfFOV = (this.iPadMiniBackCameraFOV / 2) * Math.PI / 180,
            planeDistance = (scene.width / 2) / Math.tan(halfFOV),
            MAX_INDEX = Math.pow(2, 16),
            vertex_count = (height + 1) * (width + 1),
            chunks = 2 * Math.ceil(vertex_count / (2 * MAX_INDEX)),
            rowsPerChunk = height / chunks,
            mesh = null,
            meshes = [];

        for (var y = 0; y <= height; y += yStride) {
            var oldMesh = null;
            var generateTris = y < height;
            if (generateTris && (y % rowsPerChunk) === 0) {
                oldMesh = mesh;
                mesh = new WGL.Mesh();
                meshes.push(mesh);
            }
            for (var x = 0; x <= width; x += xStride) {
				var depth = scene.cleanDepths[Math.min(height - 1, y) * scene.width + Math.min(scene.width - 1, x)];
                var pixel = R3.newPoint(xOffset + x, yOffset - y, -planeDistance),
                    index = mesh.index;
                pixel.normalize();
                var normal = pixel.copy();
                pixel.scale(depth * depthScale);
                pixel.z += depthOffset;
                mesh.addVertex(pixel, normal, x * uScale, y * vScale);

				if (generateTris && x < width) {
                    mesh.addTri(index,    index + 1,               index + widthSteps + 1);
                    mesh.addTri(index + 1,index + widthSteps + 1,  index + widthSteps + 2);
				}
			}
            
            if (oldMesh) {
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
