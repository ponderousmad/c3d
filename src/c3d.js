var C3D = (function () {
    "use strict";
    
    function View() {
        this.clearColor = [0, 0, 0, 1];
        this.maximize = true;
        this.updateInDraw = false;
        this.updateInterval = 16;
    }
    
    View.prototype.update = function (now, elapsed, keyboard, pointer) {
        // Should put something here.
    };
    
    View.prototype.render = function (room, width, height) {
        room.clear(this.clearColor);
        room.drawTest();
    };
    
    window.onload = function(e) {
        MAIN.runTestSuites();
        MAIN.start(document.getElementById("canvas3D"), new View());
    };
    
    return {
    };
}());
