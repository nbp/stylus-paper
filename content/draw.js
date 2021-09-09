(function drawOnPagesContentScript() {
    // Prevent doing the initialization twice.
    if (window.drawOnPagesContentScriptInitialized) {
        return;
    }
    window.drawOnPagesContentScriptInitialized = true;
    let svgNS = "http://www.w3.org/2000/svg";
    let pressure_radius = 20;

    function createPoint(event) {
        let circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", event.offsetX);
        circle.setAttribute("cy", event.offsetY);
        circle.setAttribute("r", event.pressure * pressure_radius);
        return circle;
    }

    function createStroke(prv_ev, new_ev) {
        if (prv_ev === null) {
            return createPoint(new_ev);
        }

        // Create a stroke as a convex shape which surround 2 circle centered on
        // each of the event locations.
        let small = prv_ev.pressure > new_ev.pressure ? new_ev : prv_ev;
        let large = prv_ev.pressure > new_ev.pressure ? prv_ev : new_ev;
        let rs = small.pressure * pressure_radius;
        let rl = large.pressure * pressure_radius;
        let cl = { x: large.offsetX, y: large.offsetY };
        let cs = { x: small.offsetX, y: small.offsetY };

        // delta to go from the large center to the small center.
        let dls = { x: cs.x - cl.x, y: cs.y - cl.y };

        // Unit vector of the line.
        let d = Math.hypot(dls.x, dls.y);
        let uls = { x: dls.x / d, y: dls.y / d };

        if (d + rs < rl) {
            // One point is embedded in the other, just draw the latest point.
            return createPoint(new_ev);
        }

        // unit vector of the previous line, with a counter clockwise rotation
        // of 90 degrees.
        let oth = { x: -uls.y, y: uls.x };

        // The angles of tangents points between circle edges and the minimal
        // convex shape which surround the 2 circles is defined by:
        //
        // phi = acos( (rl - rs) / |Cl Cs| )
        let cos_phi = (rl - rs) / d;
        let sin_phi = Math.sqrt(1 - cos_phi ** 2);
        let phi = Math.acos(cos_phi) * 180 / Math.PI;

        // The convex shape is defined by 2 arcs and 2 lines, with the 4 tangent
        // points on the circle perimeters.
        let p1 = { x: cl.x + rl * (cos_phi * uls.x + sin_phi * oth.x),
                   y: cl.y + rl * (cos_phi * uls.y + sin_phi * oth.y) };
        let p2 = { x: cl.x + rl * (cos_phi * uls.x - sin_phi * oth.x),
                   y: cl.y + rl * (cos_phi * uls.y - sin_phi * oth.y) };
        let p3 = { x: cs.x + rs * (cos_phi * uls.x - sin_phi * oth.x),
                   y: cs.y + rs * (cos_phi * uls.y - sin_phi * oth.y) };
        let p4 = { x: cs.x + rs * (cos_phi * uls.x + sin_phi * oth.x),
                   y: cs.y + rs * (cos_phi * uls.y + sin_phi * oth.y) };

        let path = [
            `M ${p1.x},${p1.y}`,
            /* large circle, arc uses the largest side */
            `a ${rl},${rl} ${phi} 1 1 ${p2.x - p1.x},${p2.y - p1.y}`,
            `l ${p3.x - p2.x},${p3.y - p2.y}`,
            /* small circle, arc uses the smallest side */
            `a ${rs},${rs} ${phi - 180} 0 1 ${p4.x - p3.x},${p4.y - p3.y}`,
            `z`
        ].join(" ");
        let shape = document.createElementNS(svgNS, "path");
        shape.setAttribute("d", path);

        return shape;
    }

    function debug_createStroke(svg, posa, posb) {
        let shape = createStroke(posa, posb);
        let ca = createPoint(posa);
        let cb = createPoint(posb);
        shape.setAttribute("stroke", "red");
        ca.setAttribute("stroke", "green");
        cb.setAttribute("stroke", "blue");
        shape.setAttribute("fill-opacity", "0.1");
        ca.setAttribute("fill-opacity", "0.1");
        cb.setAttribute("fill-opacity", "0.1");
        svg.replaceChildren(...[ca, cb, shape]);
    }

    function toggle_foreground(overlay) {
        overlay.classList.toggle("drawOnPages_above");
        overlay.classList.toggle("drawOnPages_below");
    }

    let is_down = false;
    let undo_list = [];
    let redo_list = [];
    let last_action_timestamp;
    function undo(svg) {
        if (!undo_list) return;
        let action = undo_list.pop();
        for (let elem of action.add) {
            svg.removeChild(elem.dom);
        }
        for (let elem of action.remove) {
            svg.appendChild(elem.dom);
        }
        redo_list.push(action);
    }

    function redo(svg) {
        if (!redo_list) return;
        let action = redo_list.pop();
        for (let elem of action.remove) {
            svg.removeChild(elem.dom);
        }
        for (let elem of action.add) {
            svg.appendChild(elem.dom);
        }
        undo_list.push(action);
        return;
    }

    function record_add(action) {
        if (action.pos0 === null || undo_list.length === 0) {
            // The previous action is distant, create a new record in the undo_list.
            undo_list.push({ add: [], remove: [] });
        }

        // Append the last action to the last element of the undo_list.
        let last = undo_list.pop();
        last.add.push(action);
        undo_list.push(last);
    }

    let last_position = null;
    function initHooks(overlay, svg) {
        // Add overlay listeners to draw on the svg element.
        overlay.onpointerdown = function onpointerdown(event) {
            // console.log("onpointerdown", event.button, event.offsetX, event.offsetY, event.pressure);
            if (event.button != 0) return;
            let position = {
                offsetX: event.offsetX,
                offsetY: event.offsetY,
                pressure: event.pressure
            };
            let shape = createStroke(last_position, position);
            svg.appendChild(shape);
            record_add({dom: shape, pos0: last_position, pos1: position});
            last_position = position;
            is_down = true;
        };
        overlay.onpointermove = function onpointermove(event) {
            // console.log("onpointermove", event.button, event.offsetX, event.offsetY, event.pressure);
            if (!is_down) return;
            let position = {
                offsetX: event.offsetX,
                offsetY: event.offsetY,
                pressure: event.pressure
            };
            let shape = createStroke(last_position, position);
            svg.appendChild(shape);
            record_add({dom: shape, pos0: last_position, pos1: position});
            last_position = position;
        };
        overlay.onpointerup = function onpointerup(event) {
            // console.log("onpointerup", event.button, event.offsetX, event.offsetY, event.pressure);
            if (!is_down) return;
            let position = {
                offsetX: event.offsetX,
                offsetY: event.offsetY,
                pressure: event.pressure
            };
            let shape = createStroke(last_position, position);
            svg.appendChild(shape);
            record_add({dom: shape, pos0: last_position, pos1: position});
            last_position = null;
            is_down = false;
        };

        let test_a = { pressure: 0.8, offsetX: 412, offsetY: 176 };
        let test_b = { pressure: 2.2, offsetX: 441, offsetY: 270 };
        let test = null;
        document.onkeydown = function onkeypressed(event) {
            if (event.isComposing) return;
            let keyText = "";
            if (event.metaKey) keyText += "M";
            if (event.altKey) keyText += "A";
            if (event.ctrlKey) keyText += "C";
            if (event.shiftKey) keyText += "S";
            keyText += event.key.toLowerCase();

            if (keyText === "Cz") { undo(svg); return; }
            if (keyText === "CSz") { redo(svg); return; }

            if (keyText === "Cx") { toggle_foreground(overlay); return;}

            // Testing createStroke.
            /*
            if (keyText === "a") {test = test_a; return;}
            if (keyText === "b") {test = test_b; return;}
            if (keyText === "arrowup") {test.offsetY -= 1; debug_createStroke(svg, test_a, test_b); return;}
            if (keyText === "arrowdown") {test.offsetY += 1; debug_createStroke(svg, test_a, test_b); return;}
            if (keyText === "arrowleft") {test.offsetX -= 1; debug_createStroke(svg, test_a, test_b); return;}
            if (keyText === "arrowright") {test.offsetX += 1; debug_createStroke(svg, test_a, test_b); return;}
            if (keyText === ",") {test.pressure -= 0.01; debug_createStroke(svg, test_a, test_b); return;}
            if (keyText === ".") {test.pressure += 0.01; debug_createStroke(svg, test_a, test_b); return;}
            */

            console.log(keyText);
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

        let svg = document.createElementNS(svgNS, "svg");
        overlay.appendChild(svg);
        svg.setAttribute("width", overlay.scrollWidth);
        svg.setAttribute("height", overlay.scrollHeight);

        initHooks(overlay, svg);

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
