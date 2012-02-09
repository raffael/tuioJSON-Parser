function TWFixor(options) {

	options = extend({
		/* if set to true, critical errors will throw an exception */
		throwErrors: true,
		/* if set to true, the script will output a lot of information to the console */
		verboseMode: false,
		reanimationTimeOut: 20,
		mergingTimeout: 20,
		mergeGestures: true,
		tuioJSONParser: undefined
	},options);
	
	if (!options.tuioJSONParser) throw "No tuioJSONParser object found";
	
	var tuioJSONParser	= options.tuioJSONParser;
	
	/**
	 * @public 
	 * fix()
	 * Public method provided by this library to fix T&W messages
	 * @param	msg		The decoded JSON message
	 * @return	-
	 */
	this.fix = function(msg) {
		switch(msg.type) {
			case 'touch':
				fixTouchMessage(msg);
				break;
			case 'gesture':
				bufferGestureMessages(msg);
				break;
			case 'pen':
				fixPenMessage(msg);
			default:
				tuioJSONParser.parse(msg);
		}
	}
	
	
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
	
	function fixTouchMessage(message) {
		switch (message.state) {
			case 'start':
				if (lastStateForId[message.id] && lastStateForId[message.id]=='end') {
					// clear any killer timeout:
					if (identifierTimeOuts[message.id]) clearTimeout(identifierTimeOuts[message.id]);
				} else {
					tuioJSONParser.parse(message);
				}
				break;
			case 'move':
				tuioJSONParser.parse(message);
				break;
			case 'end':
				// trigger the event later
				(function(message){
					identifierTimeOuts[message.id] = setTimeout(function(){
						tuioJSONParser.parse(message);
					}, options.reanimationTimeOut);
				})(message);
				
				break;
		}
		lastStateForId[message.id]	= message.state;
	}
	
	/*  - - - - - - PENS - - - - - */
	
	/**
	 * Since the T&W Server does not send 'start', 'move' and 'end' messages in the 'pen' messages, they
	 * have to be added in this Fixor
	 */
	var lastPenState;
	var penTimeout;
	function fixPenMessage(message) {
		switch(lastPenState) {
			case 'start':
				message.state	= 'move';
			case 'move':
				message.state	= 'move';
				break;
			case 'end':
				break;
			default:
				message.state	= 'start';
				break;				
		}
		lastPenState	= message.state;
		tuioJSONParser.parse(message);
		resetPenTimeout(message);
	}
	
	function resetPenTimeout(message) {
		if (penTimeout) clearTimeout(penTimeout);
		penTimeout			= setTimeout(function(){
			message.state	= 'end';
			lastPenState	= null; 
			tuioJSONParser.parse(message);
		}, 50);
	}
	
	
	/*  - - - - - - GESTURES - - - - - */
	
	/**
	 * currentRotationInDegree stores the last value of the rotation gesture in degrees
	 */
	var currentRotationInDegree;
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
	
	
	function bufferGestureMessages(message) {
		
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
		//console.log("parse this: ",message);
		/**
		 * First, translate relative radians to absolute degrees in 'rotate' messages
		 */
		if (message.gestureType=='rotate') {
			switch(message.state) {
				case 'start':
					currentRotationInDegree = 0;
					break;

				case 'change':
					var relRotationDegree	= message.rotation * (180.0 / Math.PI);
					message.rotation	= currentRotationInDegree += relRotationDegree;
					break;

				case 'end':
					message.rotation	= currentRotationInDegree;
					break;
			}
		}
		
		/**
		 * Then, translate relative scale factors to absolute ones in 'scale' messages
		 */
		if (message.gestureType=='scale') {
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

			var builtMessageState,
				isRotate= (message.gestureType=='rotate'),
				isScale	= (message.gestureType=='scale'),
				isStart	= (message.state=='start'),
				isChange= (message.state=='change'),
				isEnd	= (message.state=='end');
			
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
			var isRotate		= (message.gestureType=='rotate'),
				isStart			= (message.state=='start'),
				isChange		= (message.state=='change'),
				isEnd			= (message.end=='end');

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
					console.log("start happened, buffering message: ",bufferedMessage);
					message			= null;
				} else if (isChange) {
					if (bufferedMessage) {
						bufferedMessage.x	= message.x;
						bufferedMessage.y	= message.y;
						tuioJSONParser.parse(bufferedMessage);
						console.log("buffered fired as "+bufferedMessage.state);
					}
					bufferedMessage	= null;
				} else if (isEnd) {
					bufferedMessage	= null;
				}
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
	}
	
	/**
	 * extend()
	 * Method from jQuery to inject data from one object into another
	 */
	function extend(){var a,b,c,d,e,f,g=arguments[0]||{},h=1,i=arguments.length,j=false;if(typeof g==="boolean"){j=g;g=arguments[1]||{};h=2}if(typeof g!=="object"&&!jQuery.isFunction(g)){g={}}if(i===h){g=this;--h}for(;h<i;h++){if((a=arguments[h])!=null){for(b in a){c=g[b];d=a[b];if(g===d){continue}if(j&&d&&(jQuery.isPlainObject(d)||(e=jQuery.isArray(d)))){if(e){e=false;f=c&&jQuery.isArray(c)?c:[]}else{f=c&&jQuery.isPlainObject(c)?c:{}}g[b]=jQuery.inject(j,f,d)}else if(d!==undefined){g[b]=d}}}}return g}
	
}