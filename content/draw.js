(function stylusPaperContentScript() {
    // Prevent doing the initialization twice.
    if (window.stylusPaperContentScriptInitialized) {
        return;
    }
    window.stylusPaperContentScriptInitialized = true;
    let svgNS = "http://www.w3.org/2000/svg";
    let pressure_radius = 20;
    let menu = null;

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
        overlay.classList.toggle("stylusPaper_above");
        overlay.classList.toggle("stylusPaper_below");
    }

    let undo_list = [];
    let redo_list = [];
    let last_action_timestamp;
    function undo(svg) {
        if (!undo_list.length) return;
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
        if (!redo_list.length) return;
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
        function get_position(event) {
            return {
                offsetX: event.offsetX,
                offsetY: event.offsetY,
                pressure: event.pressure
            };
        }

        let pointer_actions, draw_actions, menu_actions;

        draw_actions = {
            on_leftbtn_drag: (from, to) => {
                let shape = createStroke(from, to);
                svg.appendChild(shape);
                record_add({dom: shape, pos0: from, pos1: to});
            },
            on_context_menu: pos => {
                menu.classList.toggle("hide-draw-menu");
                menu.style.transform = `translateX(${pos.x}px) translateY(${pos.y}px)`;
                pointer_actions = menu_actions;
                return true;
            }
        };

        menu_actions = {
            on_leftbtn_drag: (from, to) => {
                menu.classList.toggle("hide-draw-menu");
                menu.style.transform = "";
                pointer_actions = draw_actions;
            },
            on_context_menu: pos => {
                menu.style.transform = `translateX(${pos.x}px) translateY(${pos.y}px)`;
                return true;
            }
        };

        // Default to draw actions.
        pointer_actions = draw_actions;

        // Add overlay listeners to draw on the svg element.
        let is_leftbtn_down = false;
        overlay.onpointerdown = function onpointerdown(event) {
            // console.log("onpointerdown", event.button, event.offsetX, event.offsetY, event.pressure);
            if (event.button == 0) {
                let position = get_position(event);
                pointer_actions.on_leftbtn_drag?.(last_position, position);
                last_position = position;
                is_leftbtn_down = true;
            }
        };
        overlay.onpointermove = function onpointermove(event) {
            // console.log("onpointermove", event.button, event.offsetX, event.offsetY, event.pressure);
            if (is_leftbtn_down) {
                let position = get_position(event);
                pointer_actions.on_leftbtn_drag?.(last_position, position);
                last_position = position;
            }
        };
        overlay.onpointerup = function onpointerup(event) {
            // console.log("onpointerup", event.button, event.offsetX, event.offsetY, event.pressure);
            if (is_leftbtn_down) {
                let position = get_position(event);
                pointer_actions.on_leftbtn_drag?.(last_position, position);
                last_position = null;
                is_leftbtn_down = false;
            }
        };
        window.oncontextmenu = function oncontextmenu(event) {
            let position = { x: event.clientX, y: event.clientY };
            // TODO: The context menu is currently disabled as it is not yet
            // functional and tend to appear frequently.
            if (false && pointer_actions.on_context_menu?.(position)) {
                event.preventDefault();
            }
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
        let height = content.scrollHeight;
        let width = content.scrollWidth;

        // Update the DOM to make use of flex-box at the top-level.
        let overlay = document.createElement('div');
        overlay.setAttribute("id", "stylusPaper_foreground");
        overlay.classList.toggle("stylusPaper_above");
        let wrapper = document.createElement('div');
        wrapper.setAttribute("id", "stylusPaper_content");
        let flexer = document.createElement('div');
        flexer.setAttribute("id", "stylusPaper_body");
        wrapper.replaceChildren(...content.children);
        flexer.appendChild(wrapper);
        flexer.appendChild(overlay);
        content.appendChild(flexer);

        // Copy the height of the background to the foreground element.
        overlay.style.height = height;

        let svg = document.createElementNS(svgNS, "svg");
        overlay.appendChild(svg);
        svg.setAttribute("width", width);
        svg.setAttribute("height", height);

        initHooks(overlay, svg);

        return { content, flexer, overlay, svg, wrapper };
    }

    function findElementWithHighestScrollHeight() {
        var max_elem = document.body;
        var max_height = document.body.scrollHeight;
        var elems = document.getElementsByTagName("*");
        for (var elem of elems) {
            if (elem.scrollHeight == elem.scrollWidth && elem.scrollHeight == 1000000) {
                // sourcegraph.com has a search box which is stupidly large, and
                // thus gather the focus of the stylusPaper area.
                continue;
            }
            if (elem.scrollHeight > max_height) {
                max_elem = elem;
                max_height = elem.scrollHeight;
            }
        }
        return max_elem;
    }

    // While we could use the actual context menu to display menu items, it
    // might be better to have a drawing context menu for drawing.
    function initDrawMenu() {
        menu = document.createElement("div");
        menu.setAttribute("id", "stylusPaper_contextMenu");
        menu.classList.toggle("draw-menu");
        menu.classList.toggle("hide-draw-menu");
        menu.innerHTML = `
          <ul>
            <li><input type="color" id="stroke_color" name="stroke_color" value="#000000" /><label for="stroke_color">Stroke</label></li>
            <li><input type="range" id="stroke_width" name="stroke_width" value="20" min="1" max="100" /><label for="stroke_width">Stroke Width</label></li>
          </ul>
        `;
        let next = `
            <li><button type="button" id="pen">Pen</button></li>
            <li><button type="button" id="Select">Select</button></li>
            <li><button type="button" id="Erase">Erase</button></li>
        `;

        document.body.parentElement.appendChild(menu);
    }


    let biggest = findElementWithHighestScrollHeight();
    initDrawMenu();
    let info = initOverlay(biggest);
})();
