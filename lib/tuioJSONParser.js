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
 */
 
/**
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
 */
 
/**
 * DEVIATIONS FROM THE W3C DRAFT
 * 
 * - Attribute relatedTarget of TouchEvent specification is being ignored and always set to null
 * - Touch events touchenter and touchleave are not implemented
 * - changedTouches arrays of Touch events are simplified for sake of simplicity
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
		/* if set to true, start messages will be fired before firing change messages that do not have a preluding start message */
		fixStartEventLack: true,
		/* if set to true, Pen point events will be interpreted as mouseenter/mousemove/mouseleave events */
		interpretPenAsMouse: false,
		touch: {
			
			touchstartName:	'touchstart',
			touchmoveName:	'touchmove',
			touchendName:	'touchend'
			/*
			touchstartName:	'mousedown',
			touchmoveName:	'mousemove',
			touchendName:	'mouseup'
			*/
		},
		pen: {
			penstartName:	'mousedown',
			penmoveName:	'mousemove',
			penendName:		'mouseup'
		}
	},options);
	
	var self;
	
	/**
	 * Constructor to initialize the parser
	 */
	this.Constructor = (function(){
		this.eventDispatcher	= new EventDispatcher();
		self					= this;
	})();
		
	/**
	 * @public parse
	 * Public method to parse a valid TuioJSON protocol message
	 * 
	 * @param	message		the decoded JSON message object
	 * @return	TRUE if successful, FALSE else
	 */
	this.parse = function(message) {
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
	 * 
	 * @param	message		The full decoded JSON message object
	 * @return	Parsing success as Bool
	 */
	function parseTouchMessage(message) {
		log("Parsing Touch message ...",message);

		var position= calculatePosition(message.x, message.y),
			x		= position.x,
			y		= position.y,
			success	= false;

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
					success	= dispatchTouchstart(message.id,x,y);		
				}
				break;
				
			case 'move':
				if (!Touches[message.id]) {
					if (options.fixStartEventLack) {
						// in this case, trigger a start event artificially, and then the move event
						dispatchTouchstart(message.id,x,y);
						log("dispatched artificial touchstart");
						success	= dispatchTouchmove(message.id,x,y);
					} else {
						error("No preluding touchstart event found for touchmove event (Id.:"+message.id+")");
						success = false;
					}
				} else {
					success	= dispatchTouchmove(message.id,x,y);
				}
				break;
				
			case 'end':
				if (!Touches[message.id]) {
					error("No preluding touchstart found for touchremove event (Id.:"+message.id+")");
					success = false;
				} else {
					success	= dispatchTouchend(message.id);
				}
				break;
		}
		
		/**
		 * dispatchTouchstart
		 * Creates and dispatches a touchstart event without further validating.
		 * 
		 * @param	identifier		The Touch identifier for this event
		 * @param	x				The x position in pixels of the Touch
		 * @param	y				The y position in pixels of the Touch
		 * @return	success
		 */
		function dispatchTouchstart(identifier,x,y) {
			var success	= false;
			
			// (1) create Touch object
			var touch	 = new Touch({
				identifier:		identifier,
				target:			getTarget(x,y),
			});
			injectBrowserPositions(this, calculateBrowserPositions(x,y));
			
			// (2) save Touch object in Touch collection
			Touches[identifier]	= touch;
			rebuildTouchList();
			
			// (3) create TouchEvent object
			var touchEvent	= new TouchEvent(options.touch.touchstartName,{
				touches:		getTouches(),
				targetTouches:	getTargetTouches(touch.target),
				changedTouches:	getChangedTouches(touch),
			});
			
			// (4) Dispatch TouchEvent
			success	= self.eventDispatcher.dispatch(touchEvent, touch.target);
	
			// (5) A touchstart event happened, so the current identifier flow can potentially dispatch mouse events
			lastOneWasTouchStartEvent[identifier] = true;
			
			return success;
		}
		
		/**
		 * dispatchTouchmove
		 * Creates and dispatches a touchmove event without further validating.
		 * 
		 * @param	identifier		The Touch identifier for this event
		 * @param	x				The x position in pixels of the Touch
		 * @param	y				The y position in pixels of the Touch
		 * @return	success
		 */
		function dispatchTouchmove(identifier,x,y) {
			var success	= false;
			
			// (1) formalize the Touch object data update and inject the updated data into the existing Touch object
			injectBrowserPositions(Touches[identifier], calculateBrowserPositions(x,y));
						
			// (2) create TouchEvent object
			var touchEvent	= new TouchEvent(options.touch.touchmoveName,{
				touches:		getTouches(),
				targetTouches:	getTargetTouches(Touches[identifier].target),
				changedTouches:	getChangedTouches(Touches[identifier]),
			});
			
			// (3) Dispatch TouchEvent
			success	= self.eventDispatcher.dispatch(touchEvent, Touches[identifier].target);
	
			// (4) a touchmove happened, so the current identifier channel cannot dispatch mouse events
			lastOneWasTouchStartEvent[message.id] = false;
			
			return success;
		}
		
		/**
		 * dispatchTouchend
		 * Creates and dispatches a touchend event without further validating.
		 * 
		 * @param	identifier		The Touch identifier for this event
		 * @param	x				The x position in pixels of the Touch
		 * @param	y				The y position in pixels of the Touch
		 * @return	success
		 */
		function dispatchTouchend(identifier,x,y) {
			var success	= false;
			
			// (1) do not inject a Touch update
			// (2) create TouchEvent object
			var touchEvent	= new TouchEvent(options.touch.touchendName,{
				identifier:		identifier,
				touches:		getTouches(identifier),	// exclude this Touch from the list
				targetTouches:	getTargetTouches(Touches[identifier].target, identifier),	// exclude this Touch from the list
				changedTouches:	getChangedTouches(Touches[identifier]),
			});
			
			// (3) Dispatch TouchEvent
			success		= self.eventDispatcher.dispatch(touchEvent, Touches[identifier].target);
			
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
				};
				
				var trgt	= Touches[identifier].target;
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('mousemove', data), trgt);
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('mousedown', data), trgt);
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('mouseup', data), trgt);
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('click', data), trgt);
				
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
		var success	= false;
		
		// general position translation (drag gestures)
		if (message.x) {
			var position	= calculatePosition(message.x, message.y);
			message.x		= position.x;
			message.y		= position.y;
		}
		
		// touches[] position translation
		if (message.touches) {
			for(var i=0;i<message.touches.length;i++) {
				var position	= calculatePosition(message.touches[i].x, message.touches[i].y);
				message.touches[i].x	= position.x;
				message.touches[i].y	= position.y;
			}
		}
		
		// pivot position translation
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
				success	= parseDragGestureMessage(message);
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
		return parseCustomGestureMessage(message);
	}
	
	/**
	 * parseRotateGestureMessage
	 * parses a valid Tuio JSON message if it's a TouchGesture message with gestureType = rotate
	 * @param	message		 the message object
	 * @return	success
	 */
	function parseRotateGestureMessage(message) {
		message.scale		= 1;
		return parseCustomGestureMessage(message);
	}
	
	// simlar to 'Touches' object for Touch processing
	var DragGestureTargets	= {};
	
	/**
	 * parseDragGestureMessage
	 * parses a valid Tuio JSON message if it's a TouchGesture message with gestureType = drag.
	 * Drags are special gestures with scale = 1, rotation = 0 and additional meta information.
	 * Drags are processed similar to Touches.
	 * 
	 * @param	message		the message object
	 * @return	success
	 */
	function parseDragGestureMessage(message) {
		var success	= false;
		
		switch(message.state) {
			case 'start':
				DragGestureTargets[message.id]	= getTarget(message.x, message.y);
				break;
			case 'change':
				if (!DragGestureTargets[message.id]) {
					if (options.fixStartEventLack) {
					message.state	= 'start';
						DragGestureTargets[message.id]	= getTarget(message.x, message.y);
					} else {
						error("No preluding dragstart event found for dragchange event (Id.:"+message.id+")");
						success	= false;
					}
				}
				break;
			case 'end':
				break;
		}
		
		var dragEvent	 = new GestureEvent(message.gestureType+message.state, {
			target:		DragGestureTargets[message.id],
			scale:		1,
			rotation:	0
		});
		injectBrowserPositions(dragEvent, calculateBrowserPositions(message.x, message.y));

		var position	= calculatePosition(message.translationX, message.translationY);
		dragEvent.translationX	= position.x;
		dragEvent.translationY	= position.y;
		success	= self.eventDispatcher.dispatch(dragEvent, DragGestureTargets[message.id]);
				
		if (message.state=='end') {
			delete DragGestureTargets[message.id];
		}
		
		return success;
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
		var success	= false;
		
		switch(message.state) {
			case 'start':
			case 'change':
			case 'end':
				var target	= document.elementFromPoint(message.pivotX, message.pivotY); // TODO: THIS MIGHT BE WRONG. target determination earlier? once only?
				// only dispatch gesture if all touches are on the same element
				if (target) {
					var gestureEvent= new GestureEvent(message.gestureType+message.state, {
						target:		target,
						scale:		message.scale,
						rotation:	message.rotation
					});
					injectBrowserPositions(gestureEvent, calculateBrowserPositions(message.pivotX, message.pivotY));
					success	= self.eventDispatcher.dispatch(gestureEvent, target);
				} else {
					// no target found for this gesture event (either no touches av. or not all touches on same element)
				}
				break;
		}
		return success;
	}
	
	/**
	 * PenTargets stores the element on which the penstart event happened on
	 */
	var PenTargets = {};
	
	/**
	 * parsePenMessage
	 * parses a pen message
	 * @param	message		the message object
	 * @return	success
	 */
	function parsePenMessage(message) {
		var success = false;
		log("Parsing Pen message ...", message);
		
		switch(message.penType) {
			case 'point':
				success = parsePenPointMessage(message);
				break;
			case 'shape':
				success	= parsePenShapeMessage(message);
			case 'handwriting':
				success = parsePenHandwritingMessage(message);
				break;
		}
		return success;
	}
	
	/**
	 * parsePenPointMessage
	 * parses a Pen message that only includes position and state.
	 * Pen point events are interpreted as mousedown / mousemove / mouseup event.
	 * You can define the event names via the options.
	 * 
	 * @param	message		The message object
	 * @return	success
	 */
	function parsePenPointMessage(message) {
		var position= calculatePosition(message.x, message.y),
			x		= position.x,
			y		= position.y,
			eventName;
		
		switch (message.state) {
			case 'start':
				eventName				= options.pen.penstartName;
				PenTargets[message.id]	= getTarget(x,y);
				break;
			case 'move':
				eventName				= options.pen.penmoveName;
				break;
			case 'end':
				eventName				= options.pen.penendName;
				break;
		}

		// (1) Create PenEvent object
		var event		= new PenEvent(eventName, calculateBrowserPositions(x,y));

		// (2) Dispatch PenEvent
		success			= self.eventDispatcher.dispatch(event, PenTargets[message.id]);	
		
		// (3) Remove the reference in PenTargets if 'end' event happened
		if (eventName	== 'end') delete PenTargets[message.id];
		return success;
	}
	
	/**
	 * parsePenShapeMessage
	 * Parses a Pen message that contains shape information where penType = 'shape'.
	 * 
	 * @param	message		The message object
	 * @return	success
	 */
	function parsePenShapeMessage(message) {
	
		return false;
	}
	
	/**
	 * parsePenHandwritingMessage
	 * Parses message that contains information about handwriting recognition,
	 * where penType = 'handwriting'.
	 * 'state' should be one of 'processing' or 'state'
	 * 
	 * @param	message		the message object
	 * @return	success
	 */
	function parsePenHandwritingMessage(message) {
		var data;
		if (message.state=='result') {
			data = { words: message.words }
		} else {
			data = {};
		}
		var event	= new HandwritingEvent(message.penType+message.state,data);
		console.log("dispatch ",event);
		return self.eventDispatcher.dispatch(event, document);
	}
	
	
	/**
	 * @end parsing method implementations # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # 
	 */
	
	
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
	 * 
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
	 * "A list of Touches for every point of contact that is touching the surface and started on 
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
	
	/**
	 * getChangedTouches
	 * Returns a list of touches that have changed since the last touch event.
	 * 
	 * W3C:
	 * "For the touchstart event this must be a list of the touch points that just became active
	 * with the current event. For the touchmove event this must be a list of the touch points
	 * that have moved since the last event. For the touchend and touchcancel events this must
	 * be a list of the touch points that have just been removed from the surface. For the
	 * touchenter and touchleave events, this must be a list of the touch points that have just
	 * entered or left the target element."
	 * 
	 * @param	touch		The currently changed touch
	 * @return	the TouchList object
	 */
	function getChangedTouches(touch) {
		var result	= new TouchList();
		result.push(touch);
		return result;
	};
	
	/**
	 * getTargetForGesture
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
	function getTarget(x,y) {
		return document.elementFromPoint(x,y);
	}
	
	/**
	 * calculatePosition
	 * translates a percental coordinates object into a pixel based one
	 * 
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
	 * @param	x			the translated x coordinate in pixels
	 * @param	y			the translated y coordinate in pixels
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
	
	/**
	 * injectBrowserPositions
	 * Injects data coming from calculateBrowserPositions into an target object.
	 * This function is for speed optimization. A simple 'inject(this, calc(..));'
	 * is not as fast as this function.
	 * 
	 * @param	target		The target object
	 * @param	source		The source object to read the data from
	 * @return	-
	 */
	function injectBrowserPositions(target, source) {
		target.screenX		= source.screenX;
		target.screenY		= source.screenY;
		target.pageX		= source.pageX;
		target.pageY		= source.pageY;
		target.clientX		= source.clientX;
		target.clientY		= source.clientY;
	}
	
	
	/**
	 * @end runtime processing method implementations # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # 
	 */
	
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
	
	/**
	 * error
	 * Complement to log() but to output errors.
	 * @param	string		The string to output
	 * @return	-
	 */
	function error() {
		if (options.throwErrors) console.log(arguments[0]);
	}
	
	/**
	 * extend
	 * jQuery implementation of the extend method to extend a target object with one or
	 * multiple source objects.
	 * 
	 * @param	target		The target object to extend
	 * @param	source1		The first source object to read from
	 * @param	source2		The second source object to read from
	 * @param	...
	 * @return	the modified target object
	 */
	function extend(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=false;if(typeof g==="boolean"){j=g;g=arguments[1]||{};h=2}if(typeof g!=="object"&&!jQuery.isFunction(g)){g={}}if(i===h){g=this;--h}for(;h<i;h++){if((a=arguments[h])!=null){for(b in a){c=g[b];d=a[b];if(g===d){continue}if(j&&d&&(jQuery.isPlainObject(d)||(e=jQuery.isArray(d)))){if(e){e=false;f=c&&jQuery.isArray(c)?c:[]}else{f=c&&jQuery.isPlainObject(c)?c:{}}g[b]=jQuery.inject(j,f,d)}else if(d!==undefined){g[b]=d}}}}return g}
	
	/**
	 * properties
	 * Add the properties of source with its values to the target object (overwriting!)
	 * 
	 * @param	target		The target object to inject into
	 * @param	source		The source object to read from
	 * @return	-
	 */
	function properties(target,source) {
		for(var i in source) if (typeof source[i]!='function') target[i] = source[i];
	}
	
	/**
	 * inject
	 * Injects only those properties and their values of a source object into a target object,
	 * that the target already has.
	 * 
	 * @param	target		The target object to inject into
	 * @param	source		The source object to read from
	 * @return	-
	 */
	function inject(target,source) {
		for(var i in source) if (i in target) target[i] = source[i];
	}
	
	
	/**
	 * @end JS util method implementations # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # 
	 */
	
	
	/**
	 * @class
	 * EventDispatcher
	 * The Event Dispatcher objects can dispatch custom built JavaScript events on DOM elements.
	 */
	function EventDispatcher() {
		properties(this, {
			ctrlKeyPressed:		false,
			altKeyPressed:		false,
			shiftKeyPressed:	false,
			metaKeyPressed:		false
		});
		
		var self = this;
		
		/**
		 * Add an event listener to the document that listens to keydowns.
		 * The handler stores whether the user is currently holding on of the modifier keys.
		 * Every gesture that is dispatched will contain these modifier key values.
		 */
		document.addEventListener('keydown', function(event){
			self.ctrlKeyPressed		= event.ctrlKey || false;
			self.altKeyPressed		= event.altKey || false;
			self.shiftKeyPressed	= event.shiftKey || false;
		}, false);
		
		/**
		 * @public dispatch
		 * Dispatches a given event on a given target. Dispatching on 'document' if no target is given.
		 * 
		 * @param	event		The JavaScript event object to dispatch
		 * @param	element		Optional the DOM element to dispatch on
		 * @return	success
		 */
		this.dispatch	= function(event, element) {
			// inject modifier keys information
			event.ctrlKey	= this.ctrlKeyPressed;
			event.altKey	= this.altKeyPressed;
			event.shiftKey	= this.shiftKeyPressed;
			event.metaKey	= this.metaKeyPressed;
			
			// dispatch the event on the element or on document
			element = element || document;
			return element.dispatchEvent(event);
		}
	}
	
	
	/**
	 * @end required object implementations # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # 
	 */
	
	
	/**
	 * @interface TouchList
	 * 
	 * According to the W3C Draft of Touch Events version 2,
	 * @see https://dvcs.w3.org/hg/webevents/raw-file/tip/touchevents.html (2012-02-02)
	 */
	function TouchList(){
		return [];
	}
	
	/**
	 * @interface	Event
	 */
	function Touch(initialData) {
		// An identification number for each touch point. When a touch point becomes active, it must be assigned an identifier that is distinct from any other active touch point. While the touch point remains active, all events that refer to it must assign it the same identifier.
		this.identifier =		initialData.identifier		|| undefined;
		// The Element on which the touch point started when it was first placed on the surface, even if the touch point has since moved outside the interactive area of that element.
		this.target =			initialData.target			|| undefined;
		// The horizontal coordinate of point relative to the screen in pixels
		this.screenX =			initialData.screenX			|| undefined;
		// The vertical coordinate of point relative to the screen in pixels
		this.screenY =			initialData.screenY			|| undefined;
		// The horizontal coordinate of point relative to the viewport in pixels, including any scroll offset
		this.pageX =			initialData.pageX			|| undefined;
		// The vertical coordinate of point relative to the viewport in pixels, including any scroll offset
		this.pageY =			initialData.pageY			|| undefined;
		// The horizontal coordinate of point relative to the viewport in pixels, excluding any scroll offset
		this.clientX =			initialData.clientX			|| undefined;
		// The vertical coordinate of point relative to the viewport in pixels, excluding any scroll offset
		this.clientY =			initialData.clientY			|| undefined;
		// not implemented:
		this.force =			initialData.force			|| 0;
		this.rotationAngle =	initialData.rotationAngle	|| 0;
		this.radiusX = 			initialData.radiusX			|| 1;
		this.radiusY = 			initialData.radiusY			|| 1;
	}
	
	/**
	 * @interface	TouchEvent
	 */
	function TouchEvent(eventName, initialData) {
		var event               = document.createEvent('UIEvent');
		event.initUIEvent(eventName, true, true, window, 1);

		// A list of Touches for every point of contact currently touching the surface
		event.touches =			initialData.touches			|| new TouchList(),
		// A list of Touches for every point of contact that is touching the surface and started on the element that is the target of the current event
		event.targetTouches =	initialData.targetTouches	|| new TouchList(),
		// A list of Touches for every point of contact which contributed to the event
		event.changedTouches =	initialData.changedTouches	|| new TouchList(),
		// true if the alt (Alternate) key modifier is activated; otherwise false
		event.altKey =			initialData.altKey			|| false,
		// true if the meta (Meta) key modifier is activated; otherwise false
		event.metaKey =			initialData.metaKey			|| false,
		// true if the ctrl (Control) key modifier is activated; otherwise false
		event.ctrlKey =			initialData.ctrlKey			|| false,
		// true if the shift (Shift) key modifier is activated; otherwise false
		event.shiftKey =		initialData.shiftKey		|| false,
		// Identifies a secondary EventTarget related to a touch event.
		event.relatedTarget =	initialData.relatedTarget	|| null
		
		return event; 
	}
	
	/**
	 * @interface	MouseEvent
	 */
	function MouseEvent(eventName, initialData) {
		var event				= document.createEvent('MouseEvent');
		event.initMouseEvent(eventName, true, true, window, 
							1, initialData.screenX, initialData.screenY, initialData.clientX, initialData.clientY, 
							initialData.ctrlKey, initialData.altKey, initialData.shiftKey, initialData.metaKey,
							initialData.button, initialData.relatedTarget);
		return event;
	}
	
	/**
	 * @interface	UIEvent
	 */
	function UIEvent(eventName, initialData) {
		var event			= document.createEvent('UIEvent');
		event.initUIEvent(eventName, true, true, window, 1);
		
		event.target =			initialData.target			|| undefined;
		event.ctrlKey =			initialData.ctrlKey			|| false;
		event.altKey =			initialData.altKey			|| false;
		event.shiftKey =		initialData.shiftKey		|| false;
		event.metaKey =			initialData.metaKey			|| false;
		event.rotation =		initialData.rotation		|| 0;
		event.scale =			initialData.scale			|| 1;
		// The horizontal coordinate of point relative to the screen in pixels
		event.screenX =			initialData.screenX			|| undefined;
		// The vertical coordinate of point relative to the screen in pixels
		event.screenY =			initialData.screenY			|| undefined;
		// The horizontal coordinate of point relative to the viewport in pixels, including any scroll offset
		event.pageX =			initialData.pageX			|| undefined;
		// The vertical coordinate of point relative to the viewport in pixels, including any scroll offset
		event.pageY =			initialData.pageY			|| undefined;
		// The horizontal coordinate of point relative to the viewport in pixels, excluding any scroll offset
		event.clientX =			initialData.clientX			|| undefined;
		// The vertical coordinate of point relative to the viewport in pixels, excluding any scroll offset
		event.clientY =			initialData.clientY			|| undefined;
		
		return event;
	}
	
	/**
	 * @interface	GestureEvent
	 * @extends		UIEvent
	 */
	function GestureEvent(eventName, initialData) {
		var event	= new UIEvent(eventName, initialData);
		
		// additional attributes
		event.rotation =		(initialData.rotation!==undefined)	? initialData.rotation : 0,
		event.scale =			(initialData.scale!==undefined)		? initialData.scale : 1	
		
		return event;
	}
	
	/**
	 * @interface	PenEvent
	 * @extends		MouseEvent
	 */
	function PenEvent(eventName, initialData) {
		var event	= new MouseEvent(eventName, initialData);
		return event;
	}
	
	/**
	 * @interface	HandwritingEvent
	 */
	function HandwritingEvent(eventName,initialData){
		var event			= document.createEvent('CustomEvent');
		event.initCustomEvent(eventName, true, true, 1);
		
		// additional attribute
		event.words			= initialData.words 			|| undefined;
		
		return event;
	}
	
	
	/**
	 * @end Event interface definition implementations # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # 
	 */
	
}