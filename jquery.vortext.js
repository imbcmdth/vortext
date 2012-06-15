/*!
Vortext.js
Version 0.1.0
Copyright 2012 Cameron Lakenen

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

(function ($) {
	// requestAnimationFrame polyfill by Erik Möller
	// fixes from Paul Irish and Tino Zijdel
	(function() {
		var lastTime = 0;
		var vendors = ['ms', 'moz', 'webkit', 'o'];
		for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
			window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
			window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
									   || window[vendors[x]+'CancelRequestAnimationFrame'];
		}
	 
		if (!window.requestAnimationFrame) {
			window.requestAnimationFrame = function(callback, element) {
				var currTime = new Date().getTime();
				var timeToCall = Math.max(0, 16 - (currTime - lastTime));
				var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
				  timeToCall);
				lastTime = currTime + timeToCall;
				return id;
			};
		}
		if (!window.cancelAnimationFrame) {
			window.cancelAnimationFrame = function(id) {
				clearTimeout(id);
			};
		}
	}());

	var domPrefix = '',
		defaults = {
			radius: 100,
			multiply: 2,
			letters: false
		};
	
	function vortext(elt, options) {
		domPrefix = getDomPrefix();
		elt = $(elt);
		options = $.extend(defaults, options || {});
		
		var reg = options.letters ? /(\S)/g : /(\S+)/g,
			outside = false,
			width = elt.width(),
			height = elt.height(),
			texts = getTextNodesIn(elt),
			radius = options.radius,
			multiply = options.multiply,
			pt, lastPt, wordData, refreshPositionsTID,
			wordBVH = new njsBVH(2, 2); // 2 Dimensions, 2 nodes per leaf
		
		texts.each(function (i, text) {
			$(text).replaceWith(text.textContent.replace(reg, '<span class="vortext">$1</span>'));
		});
		
		elt.css({
			position: 'relative'
		});
		
		var wordElts = elt.find('span.vortext').css({
			position: 'relative',
			display: 'inline-block'
		});
		
		wordData = getPositionData(wordElts);
		wordBVH.build(wordData, true); // Force pre-build

		$(window).bind('mousemove touchmove',function (e) {
			pt = getCoord(e.originalEvent);
			if (isNaN(pt.x) || isNaN(pt.y)) {
				pt = lastPt;
			}
			if (pt && inBounds(pt)) {
				outside = false;
			} else if (!outside) {
				outside = true;
				loop();
			}
		}).bind('resize', function () {
			clearTimeout(refreshPositionsTID);
			refreshPositionsTID = setTimeout(function () {
				wordData = getPositionData(wordElts);
				wodBVH =  new njsBVH(2, 2);
				wordBVH.build(wordData, true); // Force pre-build
			}, 200);
		});
		
		function inBounds(pt) {
			return !(pt.x+radius < 0 || pt.x-radius > width ||
				pt.y+radius < 0 || pt.y-radius > height);
		}
		
		function loop() {
			if (pt && (!lastPt || (lastPt.x !== pt.x || lastPt.y !== pt.y))) {
				if(!lastPt ) lastPt = pt;
				var minX = Math.min(pt.x, lastPt.x);
				var minY = Math.min(pt.y, lastPt.y);
				var maxX = Math.max(pt.x, lastPt.x);
				var maxY = Math.max(pt.y, lastPt.y);

				var intervals = [ // search boundary must include radius around lastPt and pt
					{a:minX - radius, b:(maxX - minX) + radius * 2},
					{a:minY - radius, b:(maxY - minY) + radius * 2}
				];

				lastPt = pt;
				var words = wordBVH.search({intervals: intervals});
				var len = words.length,
					data, dir, dist, mult,
					newX, newY, newA, newS;

				for (var i = 0, l = len; i < l; ++i) {
					data = words[i].o;
					dir	 = direction(pt, data),
					dist = distance(pt, data),
					mult = multiply * clamp(radius - dist, 0, radius),
					sin_dir = Math.sin(dir),
					cos_dir = Math.cos(dir),
					newX = (cos_dir - sin_dir) * mult,
					newY = (sin_dir + cos_dir) * mult,
					newA = mult === 0 ? 0 : clamp(mult, 0, 1)*(dir+Math.PI/2),
					newS = clamp(2*(1 + mult)/radius, 1, radius/2);
					setTransform(data.elt.get(0), newX, newY, newA, newS);
				}
			}
		}

		function getCoord(e) {
			var off = elt.offset(),
				pageX = e.pageX || e.touches && e.touches[0].pageX,
				pageY = e.pageY || e.touches && e.touches[0].pageY;
	
			return {
				x: Math.floor(pageX - off.left),
				y: Math.floor(pageY - off.top)
			};
		}
		
		(function runLoop() {
			loop();
			requestAnimationFrame(runLoop);
		})();
	}
	
	function clamp(c, a, b) {
		// This might be faster..
		return Math.max(a, Math.min(c, b));
//		return (c < a ? a : c > b ? b : c);
	}
	
	function distance(a, b) {
		var x = a.x - b.x;
		var y = a.y - b.y;
		return Math.sqrt( x * x + y * y );
	}
	
	// direction from a TO b
	function direction(a, b) {
		return Math.atan2((b.y - a.y), (b.x - a.x));
	}
	
	function getDomPrefix() {
		var domPrefixes = 'Webkit Moz O ms Khtml'.split(' '),
			prefix = '', 
			elt = document.body;
		for (var i = 0; i < domPrefixes.length; i++) {
			if (elt.style[domPrefixes[i] + 'Transform'] !== undefined) {
				prefix = domPrefixes[i];
				break;
			}
		}
		return prefix;
	}
	
	function setTransform(element, x, y, a, s) {
		x = x || 0; y = y || 0; a = a || 0; s = s || 0;
		a *= 180/Math.PI;
		element.style[domPrefix+'Transform'] = // hack for firefox
			element.style['-' + domPrefix.toLowerCase() + '-transform'] = 
				'translate('+x+'px, '+y+'px) rotate('+a+'deg) scale('+s+')';
		
	}
	
	function getPositionData(words) {
		var wordData = [];
		words.each(function (i, word) {
			word = $(word);
			var pos = word.position(),
				w = word.width(), 
				h = word.height(),
				x = pos.left, 
				y = pos.top;
			wordData.push({
				i:[{a:x, b:w},{a:y, b:h}], // Intervals in x, y (a=start coordinate, b=width)
				o:{
					elt: word,
					x: x + w/2, y: y + h/2,
					off: {
						x: 0, y: 0, a: 0, s: 0
					}
				}
			});
		});
		return wordData;
	}
	
	function getTextNodesIn(el) {
		return $(el).find(":not(iframe)").andSelf().contents().filter(function() {
			return this.nodeType == 3;
		});
	};


	$.fn.vortext = function (options) {
		return this.each(function () {
			vortext(this, options);
		});
	};
})(jQuery);