/**
 * 
 * TWFixor
 * 
 * This class provides functionality to fix errors in tuioJSON message that come from the
 * T&W Server before passing them to the tuioJSONParser object.
 * Since the tuioJSON protocol is still a draft, the T&W developers had not the possibility
 * to meet all requirements.
 * 
 * Misbehavior:		Pen event currently do not contain identifier information
 * Fix:				Inject a fixed identifier into every Pen message
 * Sequel:			No multiple Pen inputs at once possible, since no distinguishment is possible right now
 * 
 * Misbehavior:		Pen position events currently do not contain a 'state'
 * Fix:				The first pen position event is a 'start', all others are 'change'. Set a timeout to fire an 'end'
 * Sequel:			Invalid penend event, since it is artificial
 * 
 * Misbehavior:		All gesture events currently do not contain identifier information
 * Fix:				Inject a fixed identifier into every Pen message
 * Sequel:			No multiple Gesture inputs at once possible, since no distinguishment is possible right now
 * 
 * Misbehavior:		All gesture events currently do not contain the 'touches' array, which is required to determine the target properly
 * Fix:				Artificially inject the 'touches' array with two identical touches whose positions are the same as the pivot information of the gesture
 * Sequel:			If the user begins the gesture outside of the element A but the pivot is *on* the element A, the gesture will be triggered on A, which is not right
 * 
 * Misbehavior:		All Scale event messages do contain neither pivot information (, nor 'touches' array)
 * Fix:				Use (0,0) as pivot.
 * Sequel:			Scale gesture probably will be triggered on document, unless there is an element at 0,0
 * 
 * Misbehavior:		rotatestart messages currently do not contain pivot position information
 * Fix:				Buffer the start message and send it as soon as the first rotatechange event arrives and inject the pivot information for rotatechange into the buffered rotatestart
 * 
 * Misbehavior:		
 * Fix:				
 * Sequel:			
 * 
 * Misbehavior:		
 * Fix:				
 * Sequel:			
 * 
 * Misbehavior:		
 * Fix:				
 * Sequel:			
 * 
 * While working with TongSeng:
 * 
 * Misbehavior:		TongSeng seems to not send Alive messages as Tuio Server, what results in quick 'remove, start' sequences in both Touch and Gesture events
 * Fix:				Delay all 'remove' events (Touch and Gesture) with a timeout and clear the timeout if a 'start' follows quickly after a 'remove' was sent before
 * Sequel:			Heavy use of timeouts, complex fix handling, invalid remove events since they are delayed [ms].
 * 
 */


function TWFixor(options) {

	options = extend({
		/* if set to true, critical errors will throw an exception */
		throwErrors: true,
		/* if set to true, the script will output a lot of information to the console */
		verboseMode: false,
		reanimationTimeOut: 20,
		mergingTimeout: 20,
		mergeGestures: false,
		tuioJSONParser: undefined,
		gestureChangeEventDropRate: 5,
		touchMoveEventDropRate: 1,
		doBuffering:	true
	},options);
	
	if (!options.tuioJSONParser) throw "No tuioJSONParser object found";
	
	var tuioJSONParser	= options.tuioJSONParser;
	
	/**
	 * @public setOptions
	 * Resets the options object by overwriting the current options attributes with
	 * the one specified.
	 * 
	 * @param	newOptions		The new options object extends the old one.
	 * @return	-
	 */
	this.setOptions = function(newOptions) {
		log("Resetting twFixor options.");
		options	= extend(options,newOptions);
	}
	
	/**
	 * @public 
	 * parse()
	 * Public method provided by this library to fix T&W messages and transmit them to the parser.
	 * @param	msg		The decoded JSON message
	 * @return	-
	 */
	this.parse = function(message) {
		/**
		 * clear invalid messages
		 */
		if (message.type=='welcome' || message.type=='response') {
			return;
		}
		
		/**
		 * clear invalid message attributes
		 */
		delete message.streamID;
		
		switch(message.type) {
			case 'touch':
				//if (message.state=='move') console.log("#M#"+message.id+'##'+(new Date()/1)+'##TWF');
				if (options.doBuffering) bufferTouchMessage(message);
				else fixTouchMessage(message);
				break;
			case 'gesture':
				if (options.doBuffering) bufferGestureMessage(message);
				else fixGestureMessage(message);
				break;
			case 'pen':
				fixPenMessage(message);
				break;
			case 'shape':
				fixShapeMessage(message);
				break;
			case 'handwriting':
				fixHandwritingMessage(message);
				break;
			default:
				tuioJSONParser.parse(message);
		}
	}
	
	/**
	 * getParser
	 * Getter for the parser Object
	 * @param	-		-
	 * @return	the tuioJSON Parser object
	 */
	this.getParser	= function() {
		return tuioJSONParser;
	}
	
	/**
	 * stop
	 * Delegates a stop() method call to the tuioJSON Parser object to stop its operation
	 * @param	-		-
	 * @return	-
	 */
	this.stop		= function() {
		tuioJSONParser.stop();
	}
	
	/**
	 * continue
	 * Delegates a continue() method call to the tuioJSON Parser object to continue its processing operation
	 * @param	-		-
	 * @return	-
	 */
	this.continue	= function() {
		tuioJSONParser.continue;
	}
	

/*  - - - - - - TOUCH - - - - - */


	/**
	 * lastTouchState
	 * stores the last message state ('started', 'move', 'remove') for the identifiers, which is
	 * necessary for fixing the T&W misbehavior
	 */
	var lastTouchState	= {};
	
	/**
	 * touchTimeouts
	 * stores setTimeout objects that are necessary to delete Touches to handle the T&W misbehavior
	 */
	var touchTimeouts = {};
	
	var touchMoveDropCounter = {};
	
	function bufferTouchMessage(message) {		
		switch (message.state) {
			case 'start':
				if (lastTouchState[message.id] && lastTouchState[message.id]=='end') {
					// clear any killer timeout:
					if (touchTimeouts[message.id]) clearTimeout(touchTimeouts[message.id]);
				} else {
					tuioJSONParser.parse(message);
				}
				break;
			case 'move':
				if (options.touchMoveEventDropRate>1) {
					if (touchMoveDropCounter[message.id]==undefined) touchMoveDropCounter[message.id] = 0;
					else touchMoveDropCounter[message.id] = (touchMoveDropCounter[message.id]+1) % options.touchMoveEventDropRate;
					if (touchMoveDropCounter[message.id]==0) tuioJSONParser.parse(message);
				} else {
					tuioJSONParser.parse(message);
				}
				break;
			case 'end':
				// trigger the event later
				(function(message){
					touchTimeouts[message.id] = setTimeout(function(){
						tuioJSONParser.parse(message);
					}, options.reanimationTimeOut);
				})(message);
				
				break;
		}
		lastTouchState[message.id]	= message.state;
	}
	
	function fixTouchMessage(message){
		tuioJSONParser.parse(message);
	}
	
	
/*  - - - - - - PEN - - - - - */
	
	
	/**
	 * Since the T&W Server does not send 'start', 'move' and 'end' messages in the 'pen' messages, they
	 * have to be added in this Fixor
	 */
	var lastPenState	= {};
	var penTimeouts		= {};
	function fixPenMessage(message) {
	console.log("fix pen message",message);
		// Pen message do not have an identifier yet, so set it to 1
		message.id		= 1;
		
		switch(lastPenState[message.id]) {
			case 'start':
			case 'move':
				message.state	= 'move';
				break;
			case 'end':
				// currently not the case
				break;
			default:
				message.state	= 'start';
				break;				
		}
		lastPenState[message.id]	= message.state;
		tuioJSONParser.parse(message);
		resetPenTimeout(message);
	}
	
	// reset means: move the deletion forward in time by another 50 ms interval
	function resetPenTimeout(message) {
		if (penTimeouts[message.id]) clearTimeout(penTimeouts[message.id]);
		penTimeouts[message.id]			= setTimeout(function(){
			message.state				= 'end';
			lastPenState[message.id]	= null; 
			tuioJSONParser.parse(message);
		}, 50);
	}

/*  - - - - - - SHAPE - - - - - - -*/

	function fixShapeMessage(message) {
		
		message.type	= 'shape';
		message.state	= 'result';

		if (message.shapes[0]!=undefined && message.shapes[0].keyIterator!=undefined) {
			var shapes = [];
			
			for(var i in message.shapes) {
				shapes.push(message.shapes[i].map);
			}
			
			message.shapes = shapes;
		}
	
		tuioJSONParser.parse(message);
	}
	
/*  - - - - - - HANDWRITING - - - - - - -*/

	function fixHandwritingMessage(message) {
		
		message.type	= 'handwriting';
		message.state	= 'result';
		
		// fix wrong nesting:
		if (message.words[0]!=undefined && message.words[0].alternatives) message.words	= message.words[0].alternatives;
		
		if (message.words[0]!=undefined && message.words[0].keyIterator!=undefined) {
			var words = [];
			
			for(var i in message.words) {
				words.push({
					word:		message.words[i].map.word,
					confidence:	message.words[i].map.confidence
				});
			}
			
			message.words = words;
		}
		tuioJSONParser.parse(message);
	}
	
/*  - - - - - - GESTURE - - - - - */
	
	
	/**
	 * currentRotationInDegrees stores the last value of the rotation gesture in degrees
	 */
	var currentRotationInDegrees;
	var currentScaleFactor;
	
	var lastScaleGestureMessage	= null,
		scaleHasStarted			= false;
	var lastRotateGestureMessage= null,
		rotateHasStarted		= false;
	
	/**
	 * buffering
	 */
	var lastGestureState = {};
	var gestureTimeout = {};
		
	function bufferGestureMessage(message) {
		// give them an identifier since T&W does not provide any identification information
		switch(message.gestureType) {
			case 'gesture':	message.id	= 1; break;
			case 'scale':	message.id	= 2; break;
			case 'rotation':message.id	= 3; break;
			case 'drag':	message.id	= 4; break;
			default:		message.id	= 5;
		}
		
		switch(message.state) {
			case 'start':
				if (lastGestureState[message.gestureType]=='end' && gestureTimeout[message.gestureType]) {
					clearTimeout(gestureTimeout[message.gestureType]);
				} else {
					fixGestureMessage(message);
				}
				break;
				
			case 'change':
				fixGestureMessage(message);
				break;
				
			case 'end':
				// trigger the event later
				(function(message){
					gestureTimeout[message.gestureType] = setTimeout(function(){
						fixGestureMessage(message);
					}, options.reanimationTimeOut);
				})(message);
				break;
		}
		
		lastGestureState[message.gestureType]	= message.state;
	}

	var bufferedMessage;
	var mergedMessageStartHasBeenFired = false;
	var readyToSendChangeEvents = false;
	
	var gestureChangeTicker	= {};
	
	/**
	 * Rotate gestures need to be fixed, since the T&W SDK delivers relative angles in radians.
	 * To fix that, the absolute rotation in degrees will be injected into the message.
	 * 
	 * Scale gestures need to be fixed, since the T&W SDK delivers relative scalings.
	 * To fix that, the absolute scale will be injected into the message
	 * 
	 * If set via the options, scale and rotate gestures will be merged together into one, so that
	 * the resulting gesture contains both scale and rotation value (then already fixed into absolute
	 * ones).
	 * 
	 * ASSUMPTION: No multiple gestures at once possible, since T&W does not deliver identifiers
	 * for gestures(!)
	 */
	function fixGestureMessage(message) {
		/**
		 * Give those Gesture messages an identifier.
		 * Multiple Rotate/Scale/Drag gestures at once must be differentiated using the identifier
		 * Since T&W currently does not deliver any identifier information, set all identifiers
		 * to '1' --> implies that there may not be multiple gestures of the same type at once!
		 */
		message.id	= 1;
		
		/**
		 * caching for processing
		 */
		var isRotate= (message.gestureType=='rotate'),
			isScale	= (message.gestureType=='scale'),
			isDrag	= (message.gestureType=='drag'),
			isStart	= (message.state=='start'),
			isChange= (message.state=='change'),
			isEnd	= (message.state=='end');
		
		/**
		 * First, translate relative radians to absolute degrees in 'rotate' messages
		 */
		if (isRotate) {
			switch(message.state) {
				case 'start':
					currentRotationInDegrees = 0;
					break;

				case 'change':
					var relRotationDegree	= message.rotation * (180.0 / Math.PI);
					message.rotation	= currentRotationInDegrees += relRotationDegree;
					break;

				case 'end':
					message.rotation	= currentRotationInDegrees;
					break;
			}
		}
		
		/**
		 * Then, translate relative scale factors to absolute ones in 'scale' messages
		 */
		if (isScale) {
			switch(message.state) {
				case 'start':
					currentScaleFactor	= 1;
					break;
				case 'change':
				case 'end':			// T&W sends '1' in end state
					currentScaleFactor = currentScaleFactor * message.scale;
					break;
			}
			message.scale	= currentScaleFactor;
		}
		
		if (isDrag) {
			message.x	= message.originX;
			message.y	= message.originY;
			delete message.originX;
			delete message.originY;
		}
			
		/**
		 * If set to TRUE, scale and rotate gestures will be merged together to one gesture as the W3C proposes.
		 * Therefore, as soon as both a scale and a rotate gesture have started (that is, a 'start' state came in for both),
		 * a new tuioJSON conform message will be built that contains the values scale and rotate in it.
		 * The original gestureType=='scale' & 'rotate' messages will be dropped (!) and not delivered to the parser (TODO: think about that!).
		 * 
		 * Unfortunately, both scale and rotate gestures coming from T&W do not supply any exact position information for the
		 * corresponding Touch events that, together, trigger the gesture. The only information we get, is the pivotX/Y
		 * data of the rotate gesture. That's why we assume this as the gesture's position.
		 * 
		 * Next bad thing is that the rotate gesture sends its pivot information from its first change event up. The start state
		 * only has the pivotX/Y set to 0.
		 * That's why we have to wait for a rotate:change event to come in and get its position information before triggering
		 * any of the merged messages.
		 */
		if (options.mergeGestures) {
			if (message.gestureType=='drag') return;

			var builtMessageState;
			
			if (isScale) lastScaleGestureMessage = message;
			if (isRotate) lastRotateGestureMessage = message;

			if (mergedMessageStartHasBeenFired) builtMessageState = 'change';
						
			if (isStart) {
				if (isScale) scaleHasStarted	= true;
				if (isRotate) rotateHasStarted	= true;
				builtMessageState	= 'start';
			} else if (isEnd) {
				builtMessageState	= 'end';
			}
			
			if (rotateHasStarted && scaleHasStarted) {
				if (isRotate && isChange && !readyToSendChangeEvents) {
					if (bufferedMessage) {
						bufferedMessage.pivotX	= message.pivotX;
						bufferedMessage.pivotY	= message.pivotY;
						
						tuioJSONParser.parse(bufferedMessage);
						
						bufferedMessage			= null;
						mergedMessageStartHasBeenFired	= true;
					}
					readyToSendChangeEvents		= true;
					builtMessageState = 'change';
				}

				if (builtMessageState=='start') {
					bufferedMessage	= buildMessageFromLastGestureMessages(builtMessageState);
					message			= null;
				} else {
					if (readyToSendChangeEvents) message = buildMessageFromLastGestureMessages(builtMessageState);
					else message	= null;
				}
			} else {
				// drop all other gesture messages otherwise
				message = null;
			}
			
			if (message) {
				tuioJSONParser.parse(message);
			}
			
			if (isEnd) {
				rotateHasStarted				= false;
				scaleHasStarted					= false;
				mergedMessageStartHasBeenFired	= false;
				readyToSendChangeEvents			= false;
				bufferedMessage					= null;
				lastScaleGestureMessage			= null;
				lastRotateGestureMessage		= null;
				console.log("reset");
			}
			
		} else {
			/**
			 * rotatestart messages do not contain x/y information.
			 * For rotate messages, the rotatestart message needs to be buffered until a
			 * rotatechange is coming in. Then, the x/y position of this change message will
			 * be injected into the buffered one. The buffered one will then be fired before
			 * firing the change event.
			 */
			if (isRotate) {
				message.touches	= [{x: message.pivotX, y: message.pivotY},{x: message.pivotX, y: message.pivotY}];
				
				if (isStart) {
					bufferedMessage	= message;
					message			= null;
				}
				if (isChange) {
					if (bufferedMessage) {
						extend(bufferedMessage, {
							state:	'start',
							pivotX:	message.pivotX,
							pivotY:	message.pivotY,
							touches:[{x: message.pivotX, y: message.pivotY},{x: message.pivotX, y: message.pivotY}]
						});
						tuioJSONParser.parse(bufferedMessage);
					}
					bufferedMessage	= null;
					
					if (dropBecauseOfDropRate(message.gestureType)) message = null;
				}
				if (isEnd) {
					bufferedMessage	= null;
				}
			}
			
			if (isScale) {
			// WARNING: scale event so far do not contain any position information
				extend(message, {
					pivotX:	0,
					pivotY: 0,
					touches: [{x:0,y:0},{x:0, y:0}]
				});
			}
			
			if (isDrag) {
			}
			
			if (message) tuioJSONParser.parse(message);	
		}
		
		/**
		 * used to build up a message up from both a scale and a rotate message
		 */
		function buildMessageFromLastGestureMessages(state) {
			var message = {
				type:		'gesture',
				gestureType:'gesture',
				state:		state,
				scale:		lastScaleGestureMessage.scale,
				rotation:	lastRotateGestureMessage.rotation,
				touches:	[{x: lastRotateGestureMessage.pivotX, y: lastRotateGestureMessage.pivotY},{x: lastRotateGestureMessage.pivotX, y: lastRotateGestureMessage.pivotY}],
				pivotX:		lastRotateGestureMessage.pivotX,
				pivotY:		lastRotateGestureMessage.pivotY
			};
			return message;
		}
		
		/**
		 * If the T&W is sending too many gesture messages, you can throttle them using
		 * the gestureChangeEventDropRate option field
		 */
		function dropBecauseOfDropRate(gestureType) {
			if (gestureChangeTicker[gestureType]==null) {
				gestureChangeTicker[gestureType] = 0
				return true;
			} else {
				return (gestureChangeTicker[message.gestureType]++ % options.gestureChangeEventDropRate!=0);
			}
		}
	}
	
	/**
	 * extend()
	 * Method from jQuery to inject data from one object into another
	 */
	function extend(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=false;if(typeof g==="boolean"){j=g;g=arguments[1]||{};h=2}if(typeof g!=="object"&&!jQuery.isFunction(g)){g={}}if(i===h){g=this;--h}for(;h<i;h++){if((a=arguments[h])!=null){for(b in a){c=g[b];d=a[b];if(g===d){continue}if(j&&d&&(jQuery.isPlainObject(d)||(e=jQuery.isArray(d)))){if(e){e=false;f=c&&jQuery.isArray(c)?c:[]}else{f=c&&jQuery.isPlainObject(c)?c:{}}g[b]=jQuery.inject(j,f,d)}else if(d!==undefined){g[b]=d}}}}return g}
	
}