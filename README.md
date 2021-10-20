# Stylus Paper

Use your tablet and stylus to draw over any web page content. The drawn content
scrolls with the page which is under it.

## Description

This is a Firefox addon which will overlay, when enabled, the largest scrollable
area with a transparent drawable surface.

This surface area can then be painted with variable width stroke using a stylus
pressure.

The paintable surface is anchored on the content that it overlays. This implies
that any drawing will scroll with the page that it overlays.

The paint/navigation mode can be toggled on/off, which let you access elements
of the content for following links, or interacting with the web site.

## Features
 - Stylus Pressure: When drawing, the added 'ink' will change width based on the pressure of a stylus.
 - Scrollable: Objects which are drawn will follow the overlayed content.

## Keyboard Shortcuts
 - Ctrl-Z : Undo the last paint action.
 - Ctrl-Shift-Z : Redo the last undone actions.
 - Ctrl-X : Toggle between navigation and Draw mode.

## Permissions

This addon requires some permissions from the user to behave as expected. The following is the list of permissions requested from the user, and why they are requested:

 - activeTabs: This permission is used to enable this addon only on the current
   tab. When the addon is enabled, the current tab is intrumented to add a
   drawing surface. The instrumented active tabs does not communicate back to
   the extension, nor does it creates extra network trafic.

## Testing Locally

This addon can be tested locally by following the recommendation from the [extension workshop](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

To have a more persistent installation, the script `publish.sh` is used to generate a zip file which can be added in `about:addons` after [disabling signature verfification](https://blog.mozilla.org/addons/2015/12/23/loading-temporary-add-ons/).
