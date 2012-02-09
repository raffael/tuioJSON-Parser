/**
 * tuioJSONParser (v1.0) | MIT & BSD
 * 
 * This library provides a method to parse tuioJSON protocol messages that may come from a WebSocket source.
 * The library has been developed using the great Touch & Write SDK (http://touchandwrite.de) to receive
 * demo data.
 * 
 * The tuioJSONProtocol currently support low level and high level events. At the moment, you can pass
 * three kinds of messages: touch, gesture, pen.
 * For full documentation, have a look at the TuioJSON protocol definition.
 * 
 * USAGE
 * 
 * 	(1)	create an object of the class tuioJSONParser:
 * 
 * 		var parser	= new tuioJSONParser(options);
 * 
 * 	(2) pass a JSON decoded tuioJSON message object to the parser
 * 
 * 		parser.parse( JSON.parse(webSocketMessage) );
 * 
 * 	(3) That's it, your app receives W3C conform Touches and Gestures.
 *
 * 
 * DEVIATIONS FROM THE W3C DRAFT
 * 
 * - Attribute relatedTarget of TouchEvent specification is being ignored and always set to null
 * - Touch events touchenter and touchleave are not implemented
 * - Not triggering Mouse Events, if on the corresponding Touch event the preventDefault() method
 *   is called, is not implemented
 */
function tuioJSONParser(options) {

	options = extend({
		/* if set to true, critical errors will throw an exception */
		throwErrors: true,
		/* if set to true, the script will output a lot of information to the console */
		verboseMode: false,
		/* if set to true, Touch events will be fired */
		fireTouchEvents: true,
		/* if set to true, Gesture events will be fired */
		fireGestureEvents: true,
		/* if set to true, the percental Tuio coordinates will be translated relative to the browser's position and dimension */
		browserRelativeCoordinates: false,
		/* if set to true, a touchstart-touchend sequence (no touchmoves) will trigger Mouse Move, Down, Up, Click Event */
		triggerMouseClick: true,

		fixStartEventLack: true
	},options);
	
	var that	= this;
	
	this.eventDispatcher	= new EventDispatcher();
	
	/**
	 * log
	 * Output a set of values to the console, if verbose mode is active
	 * @param	list of values		What you want to output
	 */
	function log() {
		if (options.verboseMode) {
			switch(arguments.length) {
				case 1: console.log(arguments[0]); break;
				case 2: console.log(arguments[0],arguments[1]); break;
				case 3: console.log(arguments[0],arguments[1],arguments[2]); break;
				case 4: console.log(arguments[0],arguments[1],arguments[2],arguments[3]); break;
				default: console.log(arguments);
			}
			
		}
	}
	
	function error() {
		if (options.throwErrors) console.log(arguments[0]);
	}
	
	/**
	 * parse
	 * Public method to parse a valid TuioJSON protocol message
	 * @param	message		the decoded JSON message object
	 * @return	TRUE if successful, FALSE else
	 */
	this.parse = function(message) {
		log("Incoming message ...",message);
		
		var success = false;
		switch(message.type) {
		
			case 'touch':
				if (options.fireTouchEvents) success = parseTouchMessage(message);
				break;
			
			case 'gesture':
				if (options.fireGestureEvents) success = parseGestureMessage(message);
				break;
			
			case 'pen':
				success = parsePenMessage(message);
				break;
		}
		return success;
	}

	/**
	 * Touches
	 * is a container object to store Touch objects under their identifier.
	 */
	var Touches		= {};
	
	/**
	 * lastOneWasTouchStartEvent
	 * stores a flag for each Touch identifier whether the last triggered event was a start event,
	 * which is good to know if you want the script to trigger mouse events in start-end sequences
	 */
	var lastOneWasTouchStartEvent = {};
	
	/**
	 * parseTouchMessage
	 * parses a valid Tuio JSON message if it's a Touch message (type=='touch')
	 * @param	message		The full decoded JSON message object
	 * @return	Parsing success as Bool
	 */
	function parseTouchMessage(message) {
		log("Parsing Touch message ...",message);

		var position= calculatePosition(message.x, message.y),
			x		= position.x,
			y		= position.y,
			success	= true;

		/**
		 * the following logic determines whether a Touch event for the incoming message should
		 * really be created or not.
		 */	
		switch (message.state) {
			case 'start':
				if (Touches[message.id]) {
					error("Duplicate Tuio Event identifier");
					success = false;
				} else {
					dispatchTouchstart(message.id,x,y);		
				}
				break;
				
			case 'move':
				if (!Touches[message.id]) {
					if (options.fixStartEventLack) {
						// in this case, trigger a start event artificially, and then the move event
						dispatchTouchstart(message.id,x,y);
						log("dispatched artificial touchstart");
						dispatchTouchmove(message.id,x,y);
					} else {
						error("No preluding touchstart event found for touchmove event (Id.:"+message.id+")");
						success = false;
					}
				} else {
					dispatchTouchmove(message.id,x,y);
				}
				break;
				
			case 'end':
				if (!Touches[message.id]) {
					error("No preluding touchstart found for touchremove event (Id.:"+message.id+")");
					success = false;
				} else {
					dispatchTouchend(message.id);
				}
				break;
		}
		
		function dispatchTouchstart(identifier,x,y) {
			// (1) create Touch object
			var touch	 = new Touch({
				identifier:		identifier,
				target:			getTarget(x,y),
			});
			inject(this, calculateBrowserPositions(x,y));
			
			// (2) save Touch object in Touch collection
			Touches[identifier]	= touch;
			rebuildTouchList();
			
			// (3) create TouchEvent object
			var touchEvent	= new TouchEvent('touchstart',{
				touches:		getTouches(),
				targetTouches:	getTargetTouches(touch.target),
				changedTouches:	getChangedTouches(touch),
				ctrlKey:		that.eventDispatcher.ctrlKeyPressed,
				altKey:			that.eventDispatcher.altKeyPressed,
				shiftKey:		that.eventDispatcher.shiftKeyPressed,
				metaKey:		that.eventDispatcher.metaKeyPressed
			});
			
			// (4) Dispatch TouchEvent
			that.eventDispatcher.dispatch(touchEvent, touch.target);
	
			// (5) A touchstart event happened, so the current identifier flow can potentially dispatch mouse events
			lastOneWasTouchStartEvent[identifier] = true;
			
		}
		
		function dispatchTouchmove(identifier,x,y) {
			// (1) formalize the Touch object data update
			var touchUpdate	= calculateBrowserPositions(x,y);
			// (2) inject the updated data into the existing Touch object
			inject(Touches[identifier], touchUpdate);
						
			// (3) create TouchEvent object
			var touchEvent	= new TouchEvent('touchmove',{
				touches:		getTouches(),
				targetTouches:	getTargetTouches(Touches[identifier].target),
				changedTouches:	getChangedTouches(Touches[identifier]),
				ctrlKey:		that.eventDispatcher.ctrlKeyPressed,
				altKey:			that.eventDispatcher.altKeyPressed,
				shiftKey:		that.eventDispatcher.shiftKeyPressed,
				metaKey:		that.eventDispatcher.metaKeyPressed
			});
			
			// (4) Dispatch TouchEvent
			that.eventDispatcher.dispatch(touchEvent, Touches[identifier].target);
	
			// (5) a touchmove happened, so the current identifier channel cannot dispatch mouse events
			lastOneWasTouchStartEvent[message.id] = false;
		}
		
		function dispatchTouchend(identifier,x,y) {
			// (1) do not inject a Touch update
			// (2) create TouchEvent object
			var touchEvent	= new TouchEvent('touchend',{
				identifier:		identifier,
				touches:		getTouches(identifier),	// exclude this Touch from the list
				targetTouches:	getTargetTouches(Touches[identifier].target, identifier),	// exclude this Touch from the list
				changedTouches:	getChangedTouches(Touches[identifier]),
				ctrlKey:		that.eventDispatcher.ctrlKeyPressed,
				altKey:			that.eventDispatcher.altKeyPressed,
				shiftKey:		that.eventDispatcher.shiftKeyPressed,
				metaKey:		that.eventDispatcher.metaKeyPressed
			});
			
			// (3) Dispatch TouchEvent
			that.eventDispatcher.dispatch(touchEvent, Touches[identifier].target);
			
			// (4) trigger mouse events if configured
			if (options.triggerMouseClick && lastOneWasTouchStartEvent[identifier]) {
				var data	= {
					screenX:	Touches[identifier].screenX,
					screenY:	Touches[identifier].screenY,
					pageX:		Touches[identifier].pageX,
					pageY:		Touches[identifier].pageY,
					clientX:	Touches[identifier].clientX,
					clientY:	Touches[identifier].clientY,
					target:		Touches[identifier].target,
					ctrlKey:	that.eventDispatcher.ctrlKeyPressed,
					altKey:		that.eventDispatcher.altKeyPressed,
					shiftKey:	that.eventDispatcher.shiftKeyPressed,
					metaKey:	that.eventDispatcher.metaKeyPressed
				};
				
				that.eventDispatcher.dispatch(new MouseEvent('mousemove', data), Touches[identifier].target);
				that.eventDispatcher.dispatch(new MouseEvent('mousedown', data), Touches[identifier].target);
				that.eventDispatcher.dispatch(new MouseEvent('mouseup', data), Touches[identifier].target);
				that.eventDispatcher.dispatch(new MouseEvent('click', data), Touches[identifier].target);
				
				delete lastOneWasTouchStartEvent[identifier];
			}
			delete Touches[identifier];
			rebuildTouchList();
		}
		
		return success;
	}
	
	/**
	 * parseTouchGestureMessage
	 * parses a valid Tuio JSON message if it's a TouchGesture message (type=='touchgesture')
	 * @param	message		The full decoded JSON message object
	 * @return	Parsing success as Bool
	 */
	function parseGestureMessage(message) {
		log("Parsing Touch Gesture message ...", message);
		var success;
		
		// position translation
		if (message.touches) {
			for(var i=0;i<message.touches.length;i++) {
				var position	= calculatePosition(message.touches[i].x, message.touches[i].y);
				message.touches[i].x	= position.x;
				message.touches[i].y	= position.y;
			}
		}
		if (message.pivotX) {
			var position	= calculatePosition(message.pivotX, message.pivotY);
			message.pivotX	= position.x;
			message.pivotY	= position.y;
		}
		
		switch(message.gestureType) {
			case 'scale':
				success	= parseScaleGestureMessage(message);
				break;
			
			case 'rotate':
				success	= parseRotateGestureMessage(message);
				break;
			
			case 'drag':
				break;
				
			default:
				success	= parseCustomGestureMessage(message);
				break;
		}
		return success;
	}
	
	/**
	 * parseScaleGestureMessage
	 * parses a valid Tuio JSON message if it's a TouchGesture message with gestureType = scale
	 * @param	message		 the message object
	 * @return	success
	 */
	function parseScaleGestureMessage(message) {
		message.rotation	= 0;
		parseCustomGestureMessage(message);
	}
	
	/**
	 * parseRotateGestureMessage
	 * parses a valid Tuio JSON message if it's a TouchGesture message with gestureType = rotate
	 * @param	message		 the message object
	 * @return	success
	 */
	function parseRotateGestureMessage(message) {
		message.scale		= 1;
		parseCustomGestureMessage(message);
	}
	
	/**
	 * parseCustomGestureMessage
	 * Any other message with a gestureType set will be parsed using this method.
	 * Say you have a gestureType='scale', events like scalestart, scalechange, scaleend
	 * will be fired.
	 * 
	 * @param	message		the message object
	 * @return	-
	 */
	function parseCustomGestureMessage(message) {		
		switch(message.state) {
			case 'start':
			case 'change':
			case 'end':
				var target	= document.elementFromPoint(message.pivotX, message.pivotY);
				// only dispatch gesture if all touches are on the same element
				if (target) {
					var gestureEvent	= new GestureEvent(message.gestureType+message.state,{
						target:		target,
						scale:		message.scale,
						rotation:	message.rotation
					});
					inject(gestureEvent, calculateBrowserPositions(message.pivotX, message.pivotY));
					that.eventDispatcher.dispatch(gestureEvent, target);
				} else {
					// no target found for this gesture event (either no touches av. or not all touches on same element)
				}
				break;
		}
	return true;
	}
	
	var currentPenTarget;
	/**
	 * parsePenMessage
	 * parses a pen message
	 * @param	message		the message object
	 * @return	success
	 */
	function parsePenMessage(message) {
		log("Parsing Pen message ...", message);
		
		var position= calculatePosition(message.x, message.y),
			x		= position.x,
			y		= position.y,
			success	= true,
			eventName;
		
		switch (message.state) {
			case 'start':
				eventName			= 'mouseenter';
				currentPenTarget	= document.elementFromPoint(x, y);
				console.log("set pen target to ",currentPenTarget,x,y);
				break;
			case 'move':
				eventName			= 'mousemove';
				break;
			case 'end':
				eventName			= 'mouseleave';
				break;
		}

		// (1) create PenEvent object
		var data = extend( calculateBrowserPositions(x,y), {
			ctrlKey:	that.eventDispatcher.ctrlKeyPressed,
			altKey:		that.eventDispatcher.altKeyPressed,
			shiftKey:	that.eventDispatcher.shiftKeyPressed,
			metaKey:	that.eventDispatcher.metaKeyPressed,
		});
		var event		= new PenEvent(eventName, data);

		// (2) Dispatch PenEvent
		that.eventDispatcher.dispatch(event, currentPenTarget);	
		
		if (eventName	= 'end') currentPenTarget = null;
		return true;
	}
	
	/**
	 * getTouches
	 * Returns a list of all current touches. For speed optimizations, this list is pre-built
	 * and updated manually using rebuildTouchList().
	 * You can exclude a specific touch by specifying its identifier.
	 * 
	 * W3C: touches = "A list of Touches for every point of contact currently touching the surface."
	 
	 * @param	-		-
	 * @return	TouchList object that contains all current Touches
	 */
	var currentTouchList;
	function getTouches(excludeTouchByIdentifier) {
		if (!excludeTouchByIdentifier) {
			if (!currentTouchList) {
				currentTouchList	= new TouchList();
				rebuildTouchList();
			}
			return currentTouchList;
		} else {
			var result	= new TouchList();		
			for(var i in Touches) if (i!=excludeTouchByIdentifier) result.push(Touches[i]);
			return result;
		}
	}
	
	/**
	 * rebuildTouchList
	 * For speed optimizations, the current list of all Touches (currentTouchList) will be rebuilt only
	 * on demand. This function is called whenever the global Touches object is changed
	 * @param	-		-
	 * @return	-
	 */
	function rebuildTouchList() {
		var result	= new TouchList();		
		for(var i in Touches) result.push(Touches[i]);
		currentTouchList	= result;
		//console.log("rebuild touch list");
	}
	
	
	/**
	 * getTargetTouches
	 * provides a list of all current Touches on the same target.
	 * 
	 * W3C:
	 * targetTouches = "A list of Touches for every point of contact that is touching the surface and started on 
	 * the element that is the target of the current event."
	 * 
	 * @param	element						The HTML element that acts as target
	 * @param	excludeTouchByIdentifier	You can specify an Touch identifier which shall be not part of the result
	 * 										(This is necessary to exclude an touch while triggering touchend)
	 * @return	TouchList of Touches
	 */
	function getTargetTouches(element, excludeTouchByIdentifier) {
		var result	= new TouchList();		
		for(var i in Touches) {
			if (Touches[i].target == element && (!excludeTouchByIdentifier || i!=excludeTouchByIdentifier)) result.push(Touches[i]);
		}
		return result;
	}
	
	/* W3C:
	 * "For the touchstart event this must be a list of the touch points that just became active
	 * with the current event. For the touchmove event this must be a list of the touch points
	 * that have moved since the last event. For the touchend and touchcancel events this must
	 * be a list of the touch points that have just been removed from the surface. For the
	 * touchenter and touchleave events, this must be a list of the touch points that have just
	 * entered or left the target element."
	 */
	function getChangedTouches(touch) {
		var result	= new TouchList();
		result.push(touch);
		return result;
	};
	
	/**
	 * getTargetForGesture()
	 * Returns the DOM target for a gesture based on a message. Returns null of not all touches are
	 * on the same target.
	 * 
	 * @requires	the x/y position has already been translated
	 * @param		message		The message object
	 * @return		the target OR null if invalid
	 */
	function getTargetForGesture(message) {
		var target;
		if (message.touches) {
			for(var i=0;i<message.touches.length;i++) {
				var thisTarget		= document.elementFromPoint(message.touches[i].x, message.touches[i].y);
				if (!target) target	= thisTarget;
				else {
					if (thisTarget!=target) {
						// if not all touches belong to the same target, kill this message!
						return null;
					}
				}
			}
			return target;
		} else {
			return null;
		}
	}
	
	/**
	 * getTarget
	 * Returns the DOM target for a one dimensional event (only one set of x/y coords).
	 *
 	 * @requires	the x/y position has already been translated	 
	 * @param	message			The message object
	 * @return	the target OR null
	 */
	function getTarget(message) {
		return document.elementFromPoint(message.x, message.y);
	}
	
	/**
	 * calculatePosition
	 * translates a percental coordinates object into a pixel based one
	 * @param	coords		Object containing both x and y field, percental
	 * @return	Object containing both x and y field in pixels
	 */
	function calculatePosition(x,y) {
		if (options.browserRelativeCoordinates) {
			// calculate coordinates
			return {
				x: parseInt(screen.width * x - window.screenLeft),
				y: parseInt(screen.height * y - window.screenTop)
			};
		} else {
			return {
				x: parseInt(x * window.innerWidth),
				y: parseInt(y * window.innerHeight)
			};
		}
	}
	
	/**
	 * calculateBrowserPositions()
	 * Calculates the three tuples of position information a coordinate tuple implies. Basis for
	 * the calculation is a pair of already translated x/y coordinates
	 * 
	 * @param	x		the translated x coordinate in pixels
	 * @param	y		the translated y coordinate in pixels
	 * 
	 * @return	an object containing the three tuples of position informations
	 */
	function calculateBrowserPositions(x,y) {
		return {
			screenX:		x + window.screenLeft,
			screenY:		y + window.screenTop,
			pageX:			x + window.pageXOffset,
			pageY:			y + window.pageYOffset,
			clientX:		x,
			clientY:		y
		}
	}
	
	// jQuery's extend function
	function extend(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=false;if(typeof g==="boolean"){j=g;g=arguments[1]||{};h=2}if(typeof g!=="object"&&!jQuery.isFunction(g)){g={}}if(i===h){g=this;--h}for(;h<i;h++){if((a=arguments[h])!=null){for(b in a){c=g[b];d=a[b];if(g===d){continue}if(j&&d&&(jQuery.isPlainObject(d)||(e=jQuery.isArray(d)))){if(e){e=false;f=c&&jQuery.isArray(c)?c:[]}else{f=c&&jQuery.isPlainObject(c)?c:{}}g[b]=jQuery.inject(j,f,d)}else if(d!==undefined){g[b]=d}}}}return g}
	
	// add the properties of source with its values to the target object (overwriting!)
	function properties(target,source) {
		for(var i in source) if (typeof source[i]!='function') target[i] = source[i];
	}
	
	// write only those attributes of source object into target object if the target already has them
	function inject(target,source) {
		for(var i in source) if (i in target) target[i] = source[i];
	}
	
	function EventDispatcher() {
		properties(this, {
			ctrlKeyPressed:		false,
			altKeyPressed:		false,
			shiftKeyPressed:	false,
			metaKeyPressed:		false
		});
		
		document.addEventListener('keydown', function(event){
			this.ctrlKeyPressed		= event.ctrlKey || false;
			this.altKeyPressed		= event.altKey || false;
			this.shiftKeyPressed	= event.shiftKey || false;
		}, false);
		
		this.dispatch	= function(event, element) {
			element = element || document;
			element.dispatchEvent(event);
		}
	}
	
	/**
	 * According to the W3C Draft of Touch Events version 2
	 * [https://dvcs.w3.org/hg/webevents/raw-file/tip/touchevents.html, 2012-02-02]
	 */
	// @interface TouchList
	function TouchList(){
		return [];
	}
	
	// @interface Event
	function Touch(initialData) {
		properties(this, {
			// An identification number for each touch point. When a touch point becomes active, it must be assigned an identifier that is distinct from any other active touch point. While the touch point remains active, all events that refer to it must assign it the same identifier.
			identifier:		undefined,
			// The Element on which the touch point started when it was first placed on the surface, even if the touch point has since moved outside the interactive area of that element.
			target:			undefined,
			// The horizontal coordinate of point relative to the screen in pixels
			screenX:		undefined,
			// The vertical coordinate of point relative to the screen in pixels
			screenY:		undefined,
			// The horizontal coordinate of point relative to the viewport in pixels, including any scroll offset
			pageX:			undefined,
			// The vertical coordinate of point relative to the viewport in pixels, including any scroll offset
			pageY:			undefined,
			// The horizontal coordinate of point relative to the viewport in pixels, excluding any scroll offset
			clientX:		undefined,
			// The vertical coordinate of point relative to the viewport in pixels, excluding any scroll offset
			clientY:		undefined,
			// not implemented:
			force:			0,
			rotationAngle:	0,
			radiusX: 		1,
			radiusY: 		1
		});
		inject(this, initialData);
	}
	
	// @interface TouchEvent
	function TouchEvent(eventName, initialData) {
		var props = {
			// A list of Touches for every point of contact currently touching the surface.
			touches:			new TouchList(),
			// A list of Touches for every point of contact that is touching the surface and started on the element that is the target of the current event.
			targetTouches:		new TouchList(),
			// A list of Touches for every point of contact which contributed to the event.
			changedTouches:		new TouchList(),
			// true if the alt (Alternate) key modifier is activated; otherwise false
			altKey:				false,
			// true if the meta (Meta) key modifier is activated; otherwise false.
			metaKey:			false,
			// true if the ctrl (Control) key modifier is activated; otherwise false
			ctrlKey:			false,
			// true if the shift (Shift) key modifier is activated; otherwise false
			shiftKey:			false,
			// Identifies a secondary EventTarget related to a touch event.
			relatedTarget:		null
		};
		
		var event               = document.createEvent('UIEvent');
	    event.initUIEvent(eventName, true, true, window, 1);
	    properties(event, props);
	    inject(event,initialData);
	    
		return event; 
	}
	
	// @interface MouseEvent
	function MouseEvent(eventName, initialData) {
		properties(this, {
			target:			undefined,
			screenX:		undefined,
			screenY:		undefined,
			pageX:			undefined,
			pageY:			undefined,
			clientX:		undefined,
			clientY:		undefined,
			ctrlKey:		false,
			altKey:			false,
			shiftKey:		false,
			metaKey:		false,
			button:			0,
			relatedTarget:	null
		});
		inject(this, initialData);
		
		var event			= document.createEvent('MouseEvent');
		event.initMouseEvent(eventName, true, true, window, 
							1, this.screenX, this.screenY, this.clientX, this.clientY, 
							this.ctrlKey, this.altKey, this.shiftKey, this.metaKey,
							this.button, this.relatedTarget);		
		return event;
	}
	
	// @interface UIEvent
	function UIEvent(eventName, initialData) {
		var props =  {
			target:			undefined,
			ctrlKey:		false,
			altKey:			false,
			shiftKey:		false,
			metaKey:		false,
			rotation:		0,
			scale:			1,
			// The Element on which the touch point started when it was first placed on the surface, even if the touch point has since moved outside the interactive area of that element.
			target:			undefined,
			// The horizontal coordinate of point relative to the screen in pixels
			screenX:		undefined,
			// The vertical coordinate of point relative to the screen in pixels
			screenY:		undefined,
			// The horizontal coordinate of point relative to the viewport in pixels, including any scroll offset
			pageX:			undefined,
			// The vertical coordinate of point relative to the viewport in pixels, including any scroll offset
			pageY:			undefined,
			// The horizontal coordinate of point relative to the viewport in pixels, excluding any scroll offset
			clientX:		undefined,
			// The vertical coordinate of point relative to the viewport in pixels, excluding any scroll offset
			clientY:		undefined,
			// not implemented:
		};
		
		var event			= document.createEvent('UIEvent');
		event.initUIEvent(eventName, true, true, window, 1);
		properties(event, props);
		inject(event, initialData);

		return event;
	}
	
	// @interface GestureEvent
	function GestureEvent(eventName, initialData) {
		var event	= new UIEvent(eventName, initialData);
		inject(event, {
			rotation:	(initialData.rotation!==undefined) ? initialData.rotation : 0,
			scale:		(initialData.scale!==undefined) ? initialData.scale : 1
		});		
		return event;
	}
	
	// @interface PenEvent
	function PenEvent(eventName, initialData) {
		var event	= new MouseEvent(eventName, initialData);
		return event;
	}
	
	// @interface 
}