/**
 * tuioJSONParser (v1.0) | MIT & BSD
 * 
 * This library provides a method to parse tuioJSON protocol messages that may come from a WebSocket source.
 * The library has been developed using the great Touch & Write SDK (http://touchandwrite.de) to receive
 * demo data.
 * 
 * The tuioJSONProtocol currently support low level and high level events. At the moment, you can pass
 * three kinds of messages: touch, touchgesture, pen.
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
 * A WORD ON THE T&W MISBEHAVIOR
 * 
 * It is not actually a misbehavior. Instead, the T&W SDK kills touches that last longer than a 
 * specific time interval. That fact leads to incorrect behaviour while working with longer
 * dragging gestures (think of drag'n' drop gestures), since the track of dragging will be
 * interrupted continuously. To fix that, a workaround has been implemented which costed lots
 * of the beauty of the code of this script.
 * While executing a longer drag gesture, a lot of MOVE events will be triggered. Then the
 * unexpected REMOVE event occurs and after that, a new START event with the *same* touch
 * identifier is being triggered immediately. The workaround is that all REMOVE message won't
 * trigger the removal immediately. Instead, a timer will be created that triggers the removal
 * in the future (options.reanimationTimeOut). If no START message is being received, the removal
 * will be executed, otherwise the timer will be deleted and the stream continues with the given
 * identifier.
 * It's important to mention, that this workaround cannot fix the disappearance of a touch while
 * staying with the finger at a fixed position. The T&W server kills touches that do not move
 * automatically after a period of time (~1s) and sends the remove event via tuioJSON protocol.
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

	options = extend(options,{
		/* if set to true, critical errors will throw an exception */
		throwErrors: true,
		/* if set to true, the script will output a lot of information to the console */
		verboseMode: false,
		/* if set to true, Touch events will be fired */
		fireTouchEvents: false,
		/* if set to true, Gesture events will be fired */
		fireGestureEvents: true,
		/* if set to true, the percental Tuio coordinates will be translated relative to the browser's position and dimension */
		browserRelativeCoordinates: false,
		/* if set to true, a touchstart-touchend sequence (no touchmoves) will trigger Mouse Move, Down, Up, Click Event */
		triggerMouseClick: true,
		/* specifies the timeout time [ms] for touchend triggering if fixTWRemoval is active */
		reanimationTimeOut: 50,
		/* if set to true, the script will try to fix the misbehavior of the T&W Server */
		fixTWRemoval: true
	});
	
	var that	= this;
	
	this.eventDispatcher	= new EventDispatcher();
	
	/**
	 * log
	 * Output a set of values to the console, if verbose mode is active
	 * @param	list of values		What you want to output
	 */
	function log() {
		if (options.verboseMode) console.log(arguments);
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
			
			case 'touchgesture':
				if (options.fireGestureEvents) success = parseTouchGestureMessage(message);
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
	 * lastStateForId
	 * stores the last message state ('started', 'move', 'remove') for the identifiers, which is
	 * necessary for fixing the T&W misbehavior
	 */
	var lastStateForId	= {};
	/**
	 * identifierTimeOuts
	 * stores setTimeout objects that are necessary to delete Touches to handle the T&W misbehavior
	 */
	var identifierTimeOuts = {};
	
	/**
	 * parseTouchMessage
	 * parses a valid Tuio JSON message if it's a Touch message (type=='touch')
	 * @param	message		The full decoded JSON message object
	 * @return	Parsing success as Bool
	 */
	function parseTouchMessage(message) {
		log("Parsing Touch message ...",message);

		var position= calculatePosition({x: message.x, y: message.y}),
			x		= position.x,
			y		= position.y,
			success	= true;
		
		/**
		 * the following logic determines whether a Touch event for the incoming message should
		 * really be created or not.
		 */	
		switch (message.state) {
			case 'started':
				if (Touches[message.id] && !Touches[message.id].$markedForRemoval) {
					if (options.throwErrors) throw "Duplicate Tuio Event identifier";
					success = false;
				} else {
					var makeStart = true;
					
					if (options.fixTWRemoval) {
						if (lastStateForId[message.id] && lastStateForId[message.id]=='remove') {
							// clear any killer timeout:
							if (identifierTimeOuts[message.id]) clearTimeout(identifierTimeOuts[message.id]);
							makeStart = false;
						}
					}
				
					if (makeStart) dispatchTouchstart(message.id,x,y);
				}
				break;
				
			case 'move':
				if (!Touches[message.id]) {
					if (options.fixTWRemoval) {
						// in this case, trigger a start event artificially
						dispatchTouchstart(message.id,x,y);
						console.log("dispatched artificial touchstart");
					} else {
						if (options.throwErrors) throw "No previous touchstart event found for touchmove event (Id.:"+message.id+")";
						success = false;
					}
				} else {
					dispatchTouchmove(message.id,x,y);
				}
				break;
				
			case 'remove':
				if (!Touches[message.id]) {
					if (options.throwErrors) throw "No start touch found";
					success = false;
				} else {
					var update = {
						// empty update
					};
					inject(Touches[message.id], update);
					
					if (!options.fixTWRemoval) {
						// trigger the event immediately
						dispatchTouchend(message.id);
					
					} else {
						// trigger the event later
						(function(identifier){
							identifierTimeOuts[identifier] = setTimeout(function(){
								dispatchTouchend(identifier);
							}, options.reanimationTimeOut);
						})(message.id);
						Touches[message.id].$markedForRemoval = true;
					}
				}
				break;
		}
		
		lastStateForId[message.id]	= message.state;

		function dispatchTouchstart(identifier,x,y) {
			
			// (1) create Touch object
			var touch	 = new Touch({
				identifier:		identifier,
				target:			document.elementFromPoint(x,y),
				screenX:		x + window.screenLeft,
				screenY:		y + window.screenTop,
				pageX:			x + window.pageXOffset,
				pageY:			y + window.pageYOffset,
				clientX:		x,
				clientY:		y
			});
			
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
			var touchUpdate	= {
				screenX:		x + window.screenLeft,
				screenY:		y + window.screenTop,
				pageX:			x + window.pageXOffset,
				pageY:			y + window.pageYOffset,
				clientX:		x,
				clientY:		y
			};
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
	function parseTouchGestureMessage(message) {
		log("Parsing Touch Gesture message ...", message);
		if (message['gesture-type']!='drag') console.log(message);
	}
	function parsePenMessage(message) {
		log("Parsing Pen message ...", message);
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
	 * calculatePosition
	 * translates a percental coordinates object into a pixel based one
	 * @param	coords		Object containing both x and y field, percental
	 * @return	Object containing both x and y field in pixels
	 */
	var calculatePosition = function(coords) {
		if (options.browserRelativeCoordinates) {
			// calculate coordinates
			return {
				x: parseInt(screen.width * coords.x - window.screenLeft),
				y: parseInt(screen.height * coords.y - window.screenTop)
			};
		} else {
			return {
				x: parseInt(coords.x * window.innerWidth),
				y: parseInt(coords.y * window.innerHeight)
			};
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
		var props = {
			ctrlKeyPressed:		false,
			altKeyPressed:		false,
			shiftKeyPressed:	false,
			metaKeyPressed:		false
		};
		properties(this, props);
		
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
		var props = {
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
		}
		properties(this, props);
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
		var props = {
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
		}
		properties(this, props);
		inject(this, initialData);
		
		var event			= document.createEvent('MouseEvent');
		event.initMouseEvent(eventName, true, true, window, 
							1, this.screenX, this.screenY, this.clientX, this.clientY, 
							this.ctrlKey, this.altKey, this.shiftKey, this.metaKey,
							this.button, this.relatedTarget);		
		return event;
	}
}