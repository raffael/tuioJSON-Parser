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
 *
 * USAGE
 * 
 *  (1)	create an object of the class tuioJSONParser:
 * 
 * 		var parser	= new tuioJSONParser(options);
 * 
 *  (2) pass a JSON decoded tuioJSON message object to the parser
 * 
 * 		parser.parse( JSON.parse(webSocketMessage) );
 * 
 *  (3) That's it, your app receives W3C conform Touches and Gestures.
 *
 *
 * ASSUMPTIONS
 * 
 * - the unique identifier of Touches, PenPoints, etc. are not maintained by this parser and thus
 * 	 have to be maintained by the server or any filter prepended to this parser
 * - all incoming messages are tuioJSON protocol valid
 *
 * 
 * DEVIATIONS FROM THE W3C DRAFT
 * 
 * - Attribute relatedTarget of TouchEvent specification is being ignored and always set to null
 * - Touch events touchenter and touchleave are not implemented
 * - changedTouches arrays of Touch events are simplified for sake of simplicity
 * - Not triggering Mouse Events, if on the corresponding Touch event the preventDefault() method
 *   is called, is not implemented
 * - The method 'identifiedTouch' of TouchList is not implemented for speed optimization reasons
 *
 *
 * TO DO
 * - all kind of pen events do not contain identifier information yet (T&W doesn't provide them)
 * 
 */
/**
 * tuioJSONParser
 * The class for tuioJSONParser objects
 * @author	raffael@raffael.me
 */
function tuioJSONParser(options) {

	options = extend({
		/* if set to true, critical errors will throw an exception */
		throwErrors: true,
		/* if set to true, the script will output a lot of information to the console */
		verboseMode: false,
		/* if set to true, the percental Tuio coordinates will be translated relative to the browser's position and dimension */
		useBrowserRelativeCoordinates: false,
		/* if set to true, the coordinateCalibration object will be used */
		useCoordinateCalibration: false,
		/* if set to true, start messages will be fired before firing change messages that do not have a preluding start message */
		fixStartEventLack: true,
		/* if set to true, Pen messages won't be interpreted like Touch inputs, but interpreted as mouse */
		singlePenMode: false,
		/* Using the following object, you can define what events will be triggered via Touch */
		touch: {
			startName:			'touchstart',
			moveName:			'touchmove',
			endName:			'touchend',
			/* if set to true, a touchstart-touchend sequence (no touchmoves) will trigger Mouse Move, Down, Up, Click Event */
			triggerMouseClick:	true
		},
		/* Using the following object, you can define what events will be triggered via Pen Points */
		pen: {
			startName:	'mousedown',
			moveName:	'mousemove',
			endName:	'mouseup',
			/* if set to true, a penstart-penend sequence (no penmove) will trigger Mouse Move, Down, Up, Click Event */
			triggerMouseClick:	true
		},
		/* Using the following object, you can define where the origin lies in pixels */
		coordinateOrigin: {
			x: 0,    /* in pixels */
			y: 0     /* in pixels */
		},
		dontParse: {
			touch: false,
			gesture: false,
			rotate: false,
			scale: false,
			drag: false,
			pen: false,
			shape: false,
			handwriting: false
		}
	},options);
	
	// Reference to the 'this' object
	var self;
	
	// Flag whether message parsing shall be done
	var processMessages	= true;
		
	
	/**
	 * Constructor to initialize the parser,
	 * is being executed immediately.
	 */
	this.Constructor = (function(){
		// create the Dispatcher object
		this.eventDispatcher	= new EventDispatcher();
		
		// store a reference to this
		self					= this;
		
		// extend the Document as the W3C describes
		document.createTouch	= function(view, target, identifier, pageX, pageY, screenX, screenY, radiusX, radiusY, rotationAngle, force) {
			return new Touch({
				view:			view,
				target:			target,
				identifier:		identifier,
				pageX:			pageX,
				pageY:			pageY,
				screenX:		screenX,
				screenY:		screenY,
				radiusX:		radiusX,
				radiusY:		radiusY,
				rotationAngle:	rotationAngle,
				force:			force
			});
		}
		document.createTouchList= function(touches) {
			if (typeof touches == 'object' && touches.length!=undefined) return touches;
			else if (typeof touches == 'object') {
				var list	= TouchList();
				list.push(touches);
				return list;
			} else return TouchList();
		}
		
		// extend the Document in analogy to the previous Touch extensions
		document.createPenPoint	= function(view, target, identifier, pageX, pageY, screenX, screenY) {
			return new PenPoint({
				view:			view,
				target:			target,
				identifier:		identifier,
				pageX:			pageX,
				pageY:			pageY,
				screenX:		screenX,
				screenY:		screenY
			});
		}
		document.createPenPointList= function(penPoints) {
			if (typeof penPoints == 'object' && penPoints.length!=undefined) return penPoints;
			else if (typeof penPoints == 'object') {
				var list	= PenPointList();
				list.push(penPoints);
				return list;
			} else return PenPointList();
		}
		
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
		
		/**
		 * process the message if message processing has not been stopped via the stop() method
		 */
		if (processMessages) {
			switch(message.type) {
			
				case 'touch':
					success = options.dontParse.touch || parseTouchMessage(message);
					break;
				
				case 'gesture':
					success = options.dontParse.gesture || parseGestureMessage(message);
					break;
				
				case 'pen':
					success = options.dontParse.pen || parsePenMessage(message);
					break;
				
				case 'shape':
					success = options.dontParse.shape || parseShapeMessage(message);
					break;
				
				case 'handwriting':				
					success = options.dontParse.handwriting || parseHandwritingMessage(message);
					break;
			}
		} else {
			success	= false;
		}
		return success;
	}
	
	/**
	 * @public setOptions
	 * Resets the options object by overwriting the current options attributes with
	 * the one specified.
	 * 
	 * @param	newOptions		The new options object extends the old one.
	 * @return	-
	 */
	this.setOptions = function(newOptions) {
		log("Resetting tuioJSON Parser options.");
		options	= extend(options,newOptions);
	}
	
	/**
	 * @public stop
	 * Stops the processing operation, so that new incoming messages won't be parsed,
	 * which can be useful to save resources if you have multiple browser instances running,
	 * but only one is currently active.
	 * 
	 * @param	-		-
	 * @return	-
	 */
	this.stop = function() {
		processMessages	= false;
	}
	
	/**
	 * @public stop
	 * Continues the processing operation, so that new incoming messages will be parsed
	 * 
	 * @param	-		-
	 * @return	-
	 */
	this.continue = function() {
		processMessages	= true;
	}


	/**
	 * parseTouchMessage
	 * Parses a valid Touch message by delegating the processing to the Custom Point
	 * Message parser.
	 * 
	 * @param	message		The message to be parsed
	 * @return	success
	 */
	function parseTouchMessage(message) {
		return parseCustomPointMessage(message);
	}
	
	/**
	 * parsePenMessage
	 * Parses a valid Pen message by delegating the processing to the Custom Point
	 * Message parser. The Pen messages can be parsed in Single Pen or Multiple Pen
	 * mode, which both can be activated via the parser options.
	 * 
	 * @param	message		The message to be parsed
	 * @return	success
	 */
	function parsePenMessage(message) {
		var success = false;
		if (options.singlePenMode) success = parseSinglePenMessage(message);
		else success = parseCustomPointMessage(message);
		return success;
	}
	
	/**
	 * PenPoints
	 * is a container object to store Point objects (both Touch and Pen messages contain
	 * Point objects) under their identifier.
	 */
	var PointCollection		= {
		'touch':	{},
		'pen':		{}
	};
	
	/**
	 * lastOneWasPenPointStartEvent
	 * stores a flag for each PenPoint identifier whether the last triggered event was a start event,
	 * which is good to know if you want the script to trigger mouse events in start-end sequences
	 */
	var lastOneWasStartEvent = {
		'touch':	{},
		'pen':		{}
	};

	/**
	 * parseCustomPointMessage
	 * parses a valid Tuio JSON message if it's any kind of Point message (type=='pen' or type=='touch')
	 * 
	 * @param	message		The full decoded JSON message object
	 * @return	Parsing success as Bool
	 */
	function parseCustomPointMessage(message) {
		log("Parsing CustomPoint message ...",message);
	
		var position= calculatePosition(message.x, message.y),
			x		= position.x,
			y		= position.y,
			success	= false;
	
	
		/**
		 * the following logic determines whether a Touch/Pen event for the incoming message should
		 * really be created or not.
		 */	
		switch (message.state) {
			case 'start':
				if (PointCollection[message.type][message.id]) {
					error("Duplicate Tuio Event identifier");
					success = false;
				} else {
					success	= dispatchCustomPointStart(message.type,message.id,x,y);		
				}
				break;
				
			case 'move':
				if (!PointCollection[message.type][message.id]) {
					if (options.fixStartEventLack) {
						// in this case, trigger a start event artificially, and then the move event
						dispatchCustomPointStart(message.type,message.id,x,y);
						log("dispatched artificial "+message.type+"start");
						success	= dispatchCustomPointMove(message.type,message.id,x,y);
					} else {
						error("No preluding "+message.type+"start event found for "+message.type+"move event (Id.:"+message.id+")");
						success = false;
					}
				} else {
					//perflog("#M#"+message.id+'##'+(new Date()/1)+'##BDISP');
					success	= dispatchCustomPointMove(message.type,message.id,x,y);
					//perflog("#M#"+message.id+'##'+(new Date()/1)+'##DISP');
				}
				break;
				
			case 'end':
				if (!PointCollection[message.type][message.id]) {
					error("No preluding "+message.type+"start found for "+message.type+"end event (Id.:"+message.id+")");
					success = false;
				} else {
					success	= dispatchCustomPointEnd(message.type,message.id);
				}
				break;
		}
		
		/**
		 * dispatchCustomPointStart
		 * Creates and dispatches a start event without further validating.
		 * 
		 * @param	identifier		The Touch identifier for this event
		 * @param	x				The x position in pixels of the Touch
		 * @param	y				The y position in pixels of the Touch
		 * @return	success
		 */
		function dispatchCustomPointStart(type,identifier,x,y) {
			var success	= false;
			
			// (1) create Touch object
			var point;
			switch(type) {
				case 'touch':	point = document.createTouch(document, getTarget(x,y), identifier); break;
				case 'pen':		point = document.createPenPoint(document, getTarget(x,y), identifier); break;
			}
			injectBrowserPositions(point, calculateBrowserPositions(x,y));
			
			// (2) save Touch object in Touch collection
			PointCollection[message.type][identifier]	= point;
			rebuildPointCollection(type);
			
			// (3) create TouchEvent object
			var event;
			switch(type) {
				case 'touch':	event = TouchEvent(options[type].startName,{}); break;
				case 'pen':		event = PenEvent(options[type].startName,{}); break;
			}
			event.touches			= getTouches(type);
			event.targetTouches		= getTargetTouches(type,point.target);
			event.changedTouches	= getChangedTouches(type,point);
			
			// (4) Dispatch event
			console.log("DISPATCHINT GSTART -------");
			success	= self.eventDispatcher.dispatch(event, point.target);
	
			// (5) A start event happened, so the current identifier flow can potentially dispatch mouse events
			lastOneWasStartEvent[type][identifier] = true;
			
			return success;
		}
		
		/**
		 * dispatchCustomPointMove
		 * Creates and dispatches a move event without further validating.
		 * 
		 * @param	identifier		The Touch identifier for this event
		 * @param	x				The x position in pixels of the Touch
		 * @param	y				The y position in pixels of the Touch
		 * @return	success
		 */
		function dispatchCustomPointMove(type,identifier,x,y) {
			var success	= false;
			
			// (1) formalize the Touch object data update and inject the updated data into the existing Touch object
			injectBrowserPositions(PointCollection[message.type][identifier], calculateBrowserPositions(x,y));
						
			// (2) create event object
			var event;
			switch(type) {
				case 'touch':	event = TouchEvent(options[type].moveName,{}); break;
				case 'pen':		event = PenEvent(options[type].moveName,{}); break;
			}
			event.touches			= getTouches(type);
			event.targetTouches		= getTargetTouches(type,PointCollection[message.type][identifier].target);
			event.changedTouches	= getChangedTouches(type,PointCollection[message.type][identifier]);
			
			// (3) Dispatch event
			success	= self.eventDispatcher.dispatch(event, PointCollection[message.type][identifier].target);
	
			// (4) a move happened, so the current identifier channel cannot dispatch mouse events
			lastOneWasStartEvent[type][message.id] = false;
			
			return success;
		}
		
		/**
		 * dispatchCustomPointEnd
		 * Creates and dispatches an end event without further validating.
		 * 
		 * @param	identifier		The Touch identifier for this event
		 * @param	x				The x position in pixels of the Touch
		 * @param	y				The y position in pixels of the Touch
		 * @return	success
		 */
		function dispatchCustomPointEnd(type,identifier,x,y) {
			var success	= false;
			
			// (1) do not inject a Touch update
			// (2) create TouchEvent object
			var event;
			switch(type) {
				case 'touch':	event = TouchEvent(options[type].endName,{}); break;
				case 'pen':		event = PenEvent(options[type].endName,{}); break;
			}
			
			event.identifier 		= identifier;
			event.touches			= getTouches(identifier);	// exclude this Touch from the list
			event.targetTouches		= getTargetTouches(PointCollection[message.type][identifier].target, identifier);	// exclude this Touch from the list
			event.changedTouches	= getChangedTouches(PointCollection[message.type][identifier]);
			
			// (3) Dispatch TouchEvent
			success		= self.eventDispatcher.dispatch(event, PointCollection[message.type][identifier].target);
			
			// (4) trigger mouse events if configured
			if (options[type].triggerMouseClick && lastOneWasStartEvent[type][identifier]) {
				var data	= {
					screenX:	PointCollection[message.type][identifier].screenX,
					screenY:	PointCollection[message.type][identifier].screenY,
					pageX:		PointCollection[message.type][identifier].pageX,
					pageY:		PointCollection[message.type][identifier].pageY,
					clientX:	PointCollection[message.type][identifier].clientX,
					clientY:	PointCollection[message.type][identifier].clientY,
					target:		PointCollection[message.type][identifier].target,
				};
				
				var trgt= PointCollection[message.type][identifier].target;
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('mousemove', data), trgt);
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('mousedown', data), trgt);
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('mouseup', data), trgt);
				success	= success && self.eventDispatcher.dispatch(new MouseEvent('click', data), trgt);
				
				delete lastOneWasStartEvent[type][identifier];
			}
			delete PointCollection[message.type][identifier];
			rebuildPointCollection(type);
		}
		
		return success;
	}
	
	/**
	 * parseTouchGestureMessage
	 * parses a valid Tuio JSON message if it's a TouchGesture message (type=='gesture')
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
				success	= options.dontParse.scale || parseScaleGestureMessage(message);
				break;
			
			case 'rotate':
				success	= options.dontParse.rotate || parseRotateGestureMessage(message);
				break;
			
			case 'drag':
				success	= options.dontParse.drag || parseDragGestureMessage(message);
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
	
	// similar to 'Touches' object for Touch processing
	var GestureTargets	= {};
	
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
				GestureTargets[message.id]	= getTarget(message.x, message.y);
				break;
			case 'change':
				if (!GestureTargets[message.id]) {
					if (options.fixStartEventLack) {
						message.state	= 'start';
						GestureTargets[message.id]	= getTarget(message.x, message.y);
					} else {
						error("No preluding dragstart event found for dragchange event (Id.:"+message.id+")");
						success	= false;
					}
				}
				break;
			case 'end':
				break;
		}

		// translate the relative (!) translation coordinates
		var position	= calculateRelativePosition(message.translationX, message.translationY);

		var dragEvent	= DragEvent(message.gestureType+message.state, {
			target:			GestureTargets[message.id],
			scale:			1,
			rotation:		0,
			translationX:	position.x,
			translationY:	position.y
		});
		injectBrowserPositions(dragEvent, calculateBrowserPositions(message.x, message.y));

		success	= self.eventDispatcher.dispatch(dragEvent, GestureTargets[message.id]);
				
		if (message.state=='end') {
			delete GestureTargets[message.id];
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
				GestureTargets[message.id]	= getTargetForGesture(message.touches);
				break;
			case 'change':
				if (!GestureTargets[message.id]) {
					if (options.fixStartEventLack) {
						message.state	= 'start';
						GestureTargets[message.id]	= getTargetForGesture(message.touches);
					} else {
						error("No preluding custom gesture start event found for custom gesture change event (Id.:"+message.id+")");
						success	= false;
					}
				}
				break;
			case 'end':
				break;
		}
		
		// only dispatch gesture if all touches are on the same element
		if (GestureTargets[message.id]) {
			var gestureEvent = GestureEvent(message.gestureType+message.state, {
				target:		GestureTargets[message.id],
				scale:		message.scale,
				rotation:	message.rotation
			});
			// inject pivot information if available
			if (message.pivotX) {
				injectBrowserPositions(gestureEvent, calculateBrowserPositions(message.pivotX, message.pivotY));
			}
			// dispatch
			success	= self.eventDispatcher.dispatch(gestureEvent, GestureTargets[message.id]);
		} else {
			// no target found for this gesture event (either no touches av. or not all touches on same element)
			success	= false;
		}
		
		if (message.state=='end') {
			delete GestureTargets[message.id];
		}
		return success;
	}
	
	/**
	 * PenTargets stores the element on which the penstart event happened on
	 */
	var PenTargets = {};
	
	/**
	 * parseSinglePenMessage
	 * Parses a message of type 'pen' if singlePenMode is active, that is, Pen messages
	 * will be interpreted as mouse.
	 * 
	 * NOTE: No mouseenter, mouseleave events are fired.
	 * 
	 * @param	message		The message object
	 * @return	success
	 */
	function parseSinglePenMessage(message) {
		var success	= false;
		var position= calculatePosition(message.x, message.y),
			x		= position.x,
			y		= position.y,
			eventName;
		
		switch (message.state) {
			case 'start':
				eventName				= options.pen.startName;
				PenTargets[message.id]	= getTarget(x,y);
				break;
			case 'move':
				eventName				= options.pen.moveName;
				break;
			case 'end':
				eventName				= options.pen.endName;
				break;
		}

		// (1) Create PenEvent object
		var event		= SinglePenEvent(eventName, calculateBrowserPositions(x,y));

		// (2) Dispatch PenEvent
		success			= self.eventDispatcher.dispatch(event, PenTargets[message.id]);	
		
		// (3) Remove the reference in PenTargets if 'end' event happened
		if (eventName	== 'end') delete PenTargets[message.id];
		return success;
	}
	
	/**
	 * parseShapeMessage
	 * Parses a message that contains shape information where type = 'shape'.
	 * 
	 * @param	message		The message object
	 * @return	success
	 */
	function parseShapeMessage(message) {
		var event	= ShapeEvent(message.type+message.state,message);
		return self.eventDispatcher.dispatch(event, document);
	}
	
	/**
	 * parseHandwritingMessage
	 * Parses message that contains information about handwriting recognition,
	 * where type = 'handwriting'.
	 * 'state' should be one of 'processing' or 'result'
	 * 
	 * @param	message		the message object
	 * @return	success
	 */
	function parseHandwritingMessage(message) {
		var data;
		if (message.state=='result') {
			data = { words: message.words }
		} else if(message.state=='processing') {
			data = {};
		}
		var event	= HandwritingEvent(message.type+message.state,data);
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
	 
	 * @param	type						The type of touches
	 * @return	TouchList object that contains all current Touches
	 */
	var currentTouchList = {
		'touch': null,
		'pen': null
	};
	function getTouches(type,excludeTouchByIdentifier) {
		if (!excludeTouchByIdentifier) {
			if (!currentTouchList[type]) {
				currentTouchList[type]	= TouchList();
				rebuildPointCollection(type);
			}
			return currentTouchList[type];
		} else {
			var result	= document.createTouchList();		
			for(var i in PointCollection[type]) if (i!=excludeTouchByIdentifier) result.push(PointCollection[type][i]);
			return result;
		}
	}
	
	/**
	 * rebuildPointCollection
	 * For speed optimizations, the current list of all Points (currentTouchList) will be rebuilt only
	 * on demand. This function is called whenever the global Touches object is changed
	 * 
	 * @param	type						The type of touches
	 * @return	-
	 */
	function rebuildPointCollection(type) {
		var result	= document.createTouchList();		
		for(var i in PointCollection[type]) result.push(PointCollection[type][i]);
		currentTouchList[type]	= result;
	}
	
	
	/**
	 * getTargetTouches
	 * provides a list of all current Touches on the same target.
	 * 
	 * W3C:
	 * "A list of Touches for every point of contact that is touching the surface and started on 
	 * the element that is the target of the current event."
	 * 
	 * @param	type						The type of touches
	 * @param	element						The HTML element that acts as target
	 * @param	excludeTouchByIdentifier	You can specify an Touch identifier which shall be not part of the result
	 * 										(This is necessary to exclude an touch while triggering touchend)
	 * @return	TouchList of Touches
	 */
	function getTargetTouches(type, element, excludeTouchByIdentifier) {
		var result	= document.createTouchList();
		var arr = PointCollection[type];
		for(var i in arr) {
			if (arr[i].target == element && (!excludeTouchByIdentifier || i!=excludeTouchByIdentifier)) result.push(arr[i]);
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
	 * @param	type						The type of touches
	 * @param	touch		The currently changed touch
	 * @return	the TouchList object
	 */
	function getChangedTouches(type,touch) {
		var result	= document.createTouchList();
		result.push(touch);
		return result;
	}
	
	
	/**
	 * getTargetForGesture
	 * Returns the DOM target for a gesture based on a message. Returns null of not all touches are
	 * on the same target.
	 * 
	 * @requires	the x/y position has already been translated
	 * @param		message		The message object
	 * @return		the target OR null if invalid
	 */
	function getTargetForGesture(touches) {
		var target;
		if (touches) {
			for(var i=0;i<touches.length;i++) {
				var thisTarget		= document.elementFromPoint(touches[i].x, touches[i].y);
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
		if (options.useBrowserRelativeCoordinates) {
			return {
				x: parseInt(screen.width*x - window.screenLeft - (window.outerWidth-window.innerWidth)),
				y: parseInt(screen.height*y - window.screenTop - (window.outerHeight-window.innerHeight))
			};
		} else if (options.useCoordinateCalibration) {
			return {
				x: parseInt(screen.width*x - options.coordinateOrigin.x),
				y: parseInt(screen.height*y - options.coordinateOrigin.y)
			};
		} else {
			return {
				x: parseInt(x * window.innerWidth),
				y: parseInt(y * window.innerHeight)
			};
		}
	}
	
	/**
	 * calculateRelativePosition
	 * translates a relative percental coordinates object into a pixel based one.
	 * Relative coordinates objects do not have to be related to the coordiate
	 * origin!
	 * 
	 * @param	coords		Object containing both x and y field, percental
	 * @return	Object containing both x and y field in pixels
	 */
	function calculateRelativePosition(x,y) {
		if (options.useBrowserRelativeCoordinates) {
			return {
				x: parseInt(screen.width*x - window.screenLeft - (window.outerWidth-window.innerWidth)),
				y: parseInt(screen.height*y - window.screenTop - (window.outerHeight-window.innerHeight))
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
		document.addEventListener('keyup', function(event){
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
	 * @interface CustomEvent
	 */
	function CustomEvent(eventName, initialData) {
		var event	= document.createEvent('CustomEvent');
		event.initCustomEvent(eventName, true, true, 1);
		return event;
	}
	
	/**
	 * @interface	UIEvent
	 */
	function UIEvent(eventName, initialData) {
		var event			= document.createEvent('UIEvent');
		event.initUIEvent(eventName, true, true, window, 1);
		
		return event;
	}
	
	/**
	 * @interface	MouseEvent
	 * @extends		UIEvent
	 */
	function MouseEvent(eventName, initialData) {
		var event				= document.createEvent('MouseEvent');
		event.initMouseEvent(eventName, true, true, window, 
							1,
							initialData.screenX, initialData.screenY,
							initialData.clientX, initialData.clientY, 
							initialData.ctrlKey, initialData.altKey, initialData.shiftKey, initialData.metaKey,
							initialData.button, initialData.relatedTarget);
		return event;
	}

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
	 * @class		Touch
	 */
	function Touch(initialData) {
		this.view =				initialData.view			|| undefined;
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
	 * @interface PenPointList
	 */
	function PenPointList(){
		return [];
	}
	
	/**
	 * @class		PenPoint
	 */
	function PenPoint(initialData) {
		this.view =				initialData.view			|| undefined;
		// An identification number for each Pen point. When a Pen point becomes active, it must be assigned an identifier that is distinct from any other active Pen point. While the Pen point remains active, all events that refer to it must assign it the same identifier.
		this.identifier =		initialData.identifier		|| undefined;
		// The Element on which the Pen point started when it was first placed on the surface, even if the touch point has since moved outside the interactive area of that element.
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
	}
	
	/**
	 * @interface	TouchEvent
	 * @extends		UIEvent
	 */
	function TouchEvent(eventName, initialData) {
		var event               = UIEvent(eventName, initialData);

		// A list of Touches for every point of contact currently touching the surface
		event.touches =			initialData.touches			|| document.createTouchList(),
		// A list of Touches for every point of contact that is touching the surface and started on the element that is the target of the current event
		event.targetTouches =	initialData.targetTouches	|| document.createTouchList(),
		// A list of Touches for every point of contact which contributed to the event
		event.changedTouches =	initialData.changedTouches	|| document.createTouchList(),
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
	 * @interface	GestureEvent
	 * @extends		MouseEvent
	 */
	function GestureEvent(eventName, initialData) {
		var event	= UIEvent(eventName, initialData);
		
		// additional attributes
		event.rotation =		(initialData.rotation!==undefined)	? initialData.rotation : 0,
		event.scale =			(initialData.scale!==undefined)		? initialData.scale : 1	
		
		return event;
	}
	
	/**
	 * @interface	DragEvent
	 * @extends		GestureEvent
	 */
	function DragEvent(eventName, initialData) {
		var event	= GestureEvent(eventName, initialData);
		
		// additional attributes
		event.translationX =	initialData.translationX;
		event.translationY =	initialData.translationY;
		
		return event;
	}
	
	/**
	 * @interface	PenEvent
	 * @extends		MouseEvent
	 */
	function PenEvent(eventName, initialData) {
		var event	= MouseEvent(eventName, initialData);
		event.identifier = 		initialData.identifier;
		return event;
	}
	
	/**
	 * @interface	SinglePenEvent
	 * @extends		MouseEvent
	 */
	function SinglePenEvent(eventName, initialData) {
		var event	= MouseEvent(eventName, initialData);
		return event;
	}
	
	/**
	 * @interface	ShapeEvent
	 * @extends		UIEvent
	 */
	function ShapeEvent(eventName, initialData) {
		var event	= UIEvent(eventName);
		
		// additional attribute
		event.shapes= initialData.shapes	|| undefined;
		
		return event;
	}
	
	/**
	 * @interface	HandwritingEvent
	 * @extends		UIEvent
	 */
	function HandwritingEvent(eventName,initialData){
		var event	= UIEvent(eventName,initialData);
		
		// additional attribute
		event.words	= initialData.words 			|| undefined;
		
		return event;
	}
	
/**
 * @end Event interface definition implementations # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # 
 */	
}
/**
 * The following two methods can be used to log any string at runtime
 * without the danger of performances issues because of the use of
 * the slow console.log().
 */
window.tuioJSON_performance_log_array = [];
function tuioJSON_performance_log(str) {
	tuioJSON_performance_log_array.push(str);
}
function tuioJSON_performance_log_result() {
	console.log(tuioJSON_performance_log_array.join("\n"));
}