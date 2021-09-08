(function drawOnPagesContentScript() {
    // Prevent doing the initialization twice.
    if (window.drawOnPagesContentScriptInitialized) {
        return;
    }
    window.drawOnPagesContentScriptInitialized = true;

    function initSVGAndHooks(overlay) {
        let svgNS = "http://www.w3.org/2000/svg";
        let svg = document.createElementNS(svgNS, "svg");
        overlay.appendChild(svg);
        svg.setAttribute("width", overlay.scrollWidth);
        svg.setAttribute("height", overlay.scrollHeight);

        // The angles of tangents points between circle edges and the minimal
        // convex shape which surround the 2 circles is defined by:
        //
        // phi = acos( r2 (1 - r1/r2) / |c1c2| )
        //
        // Where r2 is the radius of the largest circle.
        //       r1 is the radius of the smallest circle.
        //       |c1c2| is the distance between the centers of the circles.
        //       phi is the angle against the edge c2-c1, on both side of the
        //       edge.

        let is_down = false;
        let undo_list = [];
        // Add overlay listeners to draw on the svg element.
        overlay.onpointerdown = function onpointerdown(event) {
            let circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", event.offsetX);
            circle.setAttribute("cy", event.offsetY);
            circle.setAttribute("r", event.pressure * 20);
            undo_list.push({ add: [circle], remove: [] });
            svg.appendChild(circle);
            is_down = true;
        };
        overlay.onpointermove = function onpointermove(event) {
            if (!is_down) return;
            let circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", event.offsetX);
            circle.setAttribute("cy", event.offsetY);
            circle.setAttribute("r", event.pressure * 20);
            undo_list.push({ add: [circle], remove: [] });
            svg.appendChild(circle);
        };
        overlay.onpointerup = function onpointerup(event) {
            is_down = false;
        };

        return svg;
    }

    // Given a DOM element, replace it content by a flex box which will wrap its
    // content and overlay it with another item.
    function initOverlay(content) {
        // Update the DOM to make use of flex-box at the top-level.
        let overlay = document.createElement('div');
        overlay.setAttribute("id", "drawOnPages_foreground");
        overlay.classList.toggle("drawOnPages_above");
        let wrapper = document.createElement('div');
        wrapper.setAttribute("id", "drawOnPages_content");
        let flexer = document.createElement('div');
        flexer.setAttribute("id", "drawOnPages_body");
        wrapper.replaceChildren(...content.children);
        flexer.appendChild(wrapper);
        flexer.appendChild(overlay);
        content.appendChild(flexer);

        // Copy the height of the background to the foreground element.
        overlay.style.height = wrapper.scrollHeight;

        let svg = initSVGAndHooks(overlay);

        return { content, flexer, overlay, svg, wrapper };
    }

    function findElementWithHighestScrollHeight() {
        var max_elem = document.body;
        var max_height = document.body.scrollHeight;
        var elems = document.getElementsByTagName("*");
        for (var elem of elems) {
            if (elem.scrollHeight > max_height) {
                max_elem = elem;
                max_height = elem.scrollHeight;
            }
        }
        return max_elem;
    }


    let biggest = findElementWithHighestScrollHeight();
    let info = initOverlay(biggest);
})()
