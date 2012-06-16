(function(){

	window.njsBVH = function njsBVH(dimensions, leafSize){
		var _Dimensions = dimensions || 3;

		var _Max_Leaf = leafSize || 4; // Maximum leaf size

		var _T = null;  // The tree's root
		this.i = null;  // The tree's "envelope" or AABB

		var _kT = 1; // Cost per node-traversal
		var _kI = 1; // Cost per intersection test
		// NOTE: A single constant _kT isn't really accurate because different types of objects have different 
		// intersection costs (like spheres vs triangles). We just assume everything is a triangle.

		var _kO = 1; // Cost bonus per non-overlapped nodes
		var _kB = 0.5; // Cost savings for balanced nodes

		// ALL nodes only have one-letter variables to save space in the event that the tree is serialized.
		// TODO: Allow the tree to be serialized. :)

		var use8WayNodes = false;
		var EPSILON = 1e-6;

		function UnfinishedNode(bounding_box, sorted_arrays_of_nodes){
			return {
				i: bounding_box,
				s: sorted_arrays_of_nodes
			};
		};
		
		function BoxNode(bounding_box, children){
			return {
				i: bounding_box,
				n: children
			};
		};

		function LeafNode(bounding_box, objects){
			return {
				i: bounding_box,
				o: objects // is essentially an array of nodes!
			};
		};

		var _make_Empty = function () {
			var i, d = [];
			for (i = 0; i < _Dimensions; i++) {
				d.push({
					a: 0,
					b: 0
				});
			}
			return d;
		};

		var _make_Intervals = function (intervals, d) {
			var i;
			if (!d) d = [];
			for (i = 0; i < _Dimensions; i++) {
				d[i] = {
					a: intervals[i].a,
					b: intervals[i].b
				};
			}
			return d;
		};

	/* expands intervals A to include intervals B, intervals B is untouched
	 * [ rectangle a ] = expand_rectangle(rectangle a, rectangle b)
	 * @static function
	 */
		var _expand_Interval = function (a, b) {
			var ia, ib, n;
			ia = b.a - EPSILON;
			ib = b.b + (EPSILON*2);
			n = Math.min(a.a, ia);
	//		n -= Epsilon(n, 3);
			a.b = Math.max(a.a + a.b, ia + ib) - n;
	//		a.b = Math.max(a.a + a.b, b.a + b.b) - n;
	//		a.b += Epsilon(a.b, 3);
			a.a = n;
			return a;
		};

	/* expands intervals A to include intervals B, intervals B is untouched
	 * [ rectangle a ] = expand_rectangle(rectangle a, rectangle b)
	 * @static function
	 */
		var _expand_Intervals = function (a, b) {
			var i, n, aa, ab, ba, bb;
			if (!a) {
				a = _make_Empty();
				for (i = 0; i < _Dimensions; i++) {
					a[i].a = b[i].a;
					a[i].b = b[i].b;
				}
			} else {
				for (i = 0; i < _Dimensions; i++) {
					_expand_Interval(a[i], b[i]);
				}
			}
			return a;
		};
		
		var _overlap_intervals = function (a, b) {
			var i, ret_val = true;
			if (a.length != _Dimensions || b.length != _Dimensions) {
				ret_val = false;
			} // Should probably be an error.
			for (i = 0; i < _Dimensions; i++) {
				ret_val = ret_val && (a[i].a <= (b[i].a + b[i].b) && (a[i].a + a[i].b) >= b[i].a);
			}
			return ret_val;
		};

	/* generates a minimally bounding intervals for all intervals in
	 * array "nodes". If intervals is set, it is modified into the MBV. Otherwise,
	 * a new set of intervals is generated and returned.
	 * [ rectangle a ] = make_MBR(rectangle array nodes, rectangle rect)
	 * @static function
	 */
		var _make_MBV = function (nodes, intervals) {
			var d = 0;
			if (nodes.length < 1) {
				return _make_Empty();
			}

			if (!intervals) {
				intervals = _make_Intervals(nodes[0].i);
				d = 1;
			}

			for (var i = nodes.length - 1; i >= d; i--) {
				_expand_Intervals(intervals, nodes[i].i);
			}

			return (intervals);
		};

		var _make_sorted_arrays = function(array_of_nodes){
			var destination_arrays = [];
			var number_of_objects = array_of_nodes.length
			var number_of_axis = array_of_nodes[0].i.length; // Length of bounding box array
			var sorted_array = [];
			var sort_function = function(a, b) {
					return (b.i[number_of_axis].a - a.i[number_of_axis].a);
			}

			while(number_of_axis-->0){
				sorted_array = array_of_nodes.slice(0);
				sorted_array.sort(sort_function);
				destination_arrays[number_of_axis] = sorted_array;
				sorted_array = [];
			}

			return destination_arrays;
		};

		// Based on SAH
		// TODO: Make _excluded_ region count towards cost (as a bonus).
		var _calculate_cost = function(number_of_axis, left_plane, right_plane, left_count, right_count, left_AABB, right_AABB, parent_surface_area){
			var t = _Dimensions, s;
			var left_surface_area = 0;
			var right_surface_area = 0;
			var overlap_surface_area = 0;
			var overlap_width = left_plane - right_plane;
			// When overlap <  0 the planes do not overlap

			// When overlap <  0 the planes do not overlap
			var doesOverlap = overlap_width > 0 ? true : false;
			overlap_width = Math.abs(overlap_width);

			while(t-->0) {
				s = t - 1;
				if(s < 0) s = _Dimensions - 1;
				if(doesOverlap){
					left_surface_area  += 2 * (t == number_of_axis ? left_AABB[t].b - overlap_width : left_AABB[t].b)
											* (s == number_of_axis ? left_AABB[s].b - overlap_width : left_AABB[s].b);
					right_surface_area += 2 * (t == number_of_axis ? right_AABB[t].b - overlap_width: right_AABB[t].b)
											* (s == number_of_axis ? right_AABB[s].b - overlap_width: right_AABB[s].b);
				} else {
					left_surface_area  += 2 * left_AABB[t].b
											* left_AABB[s].b;
					right_surface_area += 2 * right_AABB[t].b
											* right_AABB[s].b;
				}
				overlap_surface_area   += 2 * (t == number_of_axis ? overlap_width : left_AABB[t].b) 
										    * (s == number_of_axis ? overlap_width : right_AABB[s].b);
			}

			if(doesOverlap)
				var SAH = _kT + _kI * ( (left_surface_area/parent_surface_area)*left_count 
						  + (right_surface_area/parent_surface_area)*right_count 
						  + (overlap_surface_area/parent_surface_area)*(right_count+left_count) );
			else
				var SAH = _kT + _kI * ( (left_surface_area/parent_surface_area)*left_count 
						  + (right_surface_area/parent_surface_area)*right_count)
						  - _kO * (overlap_surface_area/parent_surface_area)*(right_count+left_count);

			if(Math.abs(right_count - left_count) <= 1) SAH *= _kB;

			return SAH;
		}

		var _calculate_surface_area = function(AABB){
			var surface_area = 0;
			var i = AABB.length;
			var last_i = 0;
			while(i--) {
				surface_area += 2 * AABB[i].b * AABB[last_i].b;
				last_i = i;
			}
			return surface_area;
		};

		var _get_lowest_cost = function(sorted_arrays_of_nodes, AABB, do_axis) { // returns axis and node to split into left and right
			var parent_surface_area = _calculate_surface_area(AABB);
			var cheapest_axis = -1;
			var cheapest_index = -1;
			var cheapest_cost = -1;
			var cheapest_left_plane = -1;
			var cheapest_right_plane = -1;
			var number_of_axis = sorted_arrays_of_nodes.length; // Length of bounding box array

			var number_of_objects = 0;
			var current_left_plane = Math.NaN;
			var current_right_plane = 0;
			var current_left_count = 0;
			var current_right_count = 0;
			var current_cost = 0;
			var current_start = 0;
			var current_end = 0;
			var left_AABB, right_AABB;
			while(number_of_axis-->0){
	//		if(do_axis != number_of_axis) continue;
				left_AABB = _make_Intervals(AABB);
				right_AABB = _make_Intervals(AABB);

	// TODO: Calculate the "cost" of making an "excluding node" 
	// (where ONLY the overlap contains children)

				current_left_count = 0;
				object_array = sorted_arrays_of_nodes[number_of_axis];
				current_right_count = number_of_objects = object_array.length;

				//current_right_plane = current_left_plane = sorted_arrays_of_nodes[number_of_axis][number_of_objects-1].a;
				current_left_plane = Math.NaN;
				next_object = object_array[number_of_objects-1];
				while(number_of_objects-->1){
					object = next_object;
					next_object = object_array[number_of_objects-1];
					//move one object at a time to the left and find the score
					current_left_count++;
					current_right_count--;

					current_end = object.i[number_of_axis].a + object.i[number_of_axis].b;
					current_start = next_object.i[number_of_axis].a;

					current_left_plane = current_left_plane == Math.NaN ? current_end+EPSILON : Math.max(current_left_plane, current_end+EPSILON);
					current_right_plane = current_start-EPSILON;
					left_AABB[number_of_axis].b = current_left_plane - left_AABB[number_of_axis].a;
					right_AABB[number_of_axis].b -= current_right_plane - right_AABB[number_of_axis].a;
					right_AABB[number_of_axis].a = current_right_plane;

					current_cost = _calculate_cost(number_of_axis, current_left_plane, current_right_plane, current_left_count, current_right_count, left_AABB, right_AABB, parent_surface_area);
					if(cheapest_cost + cheapest_index + cheapest_axis < 0 || current_cost < cheapest_cost) {
						cheapest_axis = number_of_axis;
						cheapest_index = number_of_objects;
						cheapest_cost = current_cost;
						cheapest_left_plane = current_left_plane;
						cheapest_right_plane = current_right_plane;
					}
				}
			}
	//		return([cheapest_axis, cheapest_index, cheapest_left_plane, cheapest_right_plane, cheapest_cost]);
			return({axis:cheapest_axis, index:cheapest_index, left:cheapest_left_plane, right:cheapest_right_plane, cost:cheapest_cost});
		}

		var _split_node_arrays = function(sorted_arrays_of_nodes, best_axis, best_index, left_plane, right_plane){
			var number_of_axis = sorted_arrays_of_nodes.length; // Length of bounding box array
			var number_of_objects = 0;
			//we make 2 * # of axis (so 3) lists 
			var destination_arrays = [[], []];
			var left_array = [];
			var right_array = [];
			destination_arrays[0] = [];
			destination_arrays[1] = [];
			var object_array, object;

			// First, split the best-fit array
			left_array = sorted_arrays_of_nodes[best_axis].slice(best_index);
			right_array = sorted_arrays_of_nodes[best_axis].slice(0, best_index);

			destination_arrays[0][best_axis] = left_array;
			destination_arrays[1][best_axis] = right_array;
			left_array = [];
			right_array = [];

			while(number_of_axis-->0){
				if(number_of_axis == best_axis) continue;
				object_array = sorted_arrays_of_nodes[number_of_axis];
				number_of_objects = object_array.length;
				while(number_of_objects-->0){
					object = object_array[number_of_objects];
					if(object.i[best_axis].a < right_plane) {
						left_array.push(object);
					} else if(object.i[best_axis].a + object.i[best_axis].b > left_plane) {
						right_array.push(object);
					} else if( destination_arrays[0][best_axis].indexOf(object) >= 0)
						left_array.push(object);
					else
						right_array.push(object);
				}
				destination_arrays[0][number_of_axis] = left_array.reverse();
				destination_arrays[1][number_of_axis] = right_array.reverse();
				left_array = [];
				right_array = [];
			}
			return destination_arrays;
		}

		var _recursive_build = function(sorted_arrays_of_nodes, AABB){
			var number_of_objects = sorted_arrays_of_nodes[0].length;

			if(number_of_objects <= _Max_Leaf) return BoxNode(_make_MBV(sorted_arrays_of_nodes[0]), sorted_arrays_of_nodes[0]);
			var final_nodes = [];

			var sub_part_a = _build_subpart(sorted_arrays_of_nodes, AABB, []);
			var excluded_axis = [sub_part_a.axis];

			number_of_objects = sub_part_a.nodes[0][0].length;
			if(number_of_objects <= _Max_Leaf) {
					final_nodes.push(BoxNode(_make_MBV(sub_part_a.nodes[0][0]), sub_part_a.nodes[0][0]));
			} else {
				var sub_part_a_a = _build_subpart(sub_part_a.nodes[0], _make_MBV(sub_part_a.nodes[0][0]), excluded_axis);
				excluded_axis.push(sub_part_a_a.axis);
				if(!use8WayNodes){
					final_nodes.push(_recursive_build(sub_part_a_a.nodes[0], _make_MBV(sub_part_a_a.nodes[0][0])));
					final_nodes.push(_recursive_build(sub_part_a_a.nodes[1], _make_MBV(sub_part_a_a.nodes[1][0])));
				} else {
					number_of_objects = sub_part_a_a.nodes[0][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_a.nodes[0][0]), sub_part_a_a.nodes[0][0]));
					} else {
						var sub_part_a_a_a = _build_subpart(sub_part_a_a.nodes[0], _make_MBV(sub_part_a_a.nodes[0][0]), excluded_axis);
						final_nodes.push(_recursive_build(sub_part_a_a_a.nodes[0], _make_MBV(sub_part_a_a_a.nodes[0][0])));
						final_nodes.push(_recursive_build(sub_part_a_a_a.nodes[1], _make_MBV(sub_part_a_a_a.nodes[1][0])));
					}
					number_of_objects = sub_part_a_a.nodes[1][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_a.nodes[1][0]), sub_part_a_a.nodes[1][0]));
					} else {
						var sub_part_a_a_b = _build_subpart(sub_part_a_a.nodes[1],  _make_MBV(sub_part_a_a.nodes[1][0]), excluded_axis);
						final_nodes.push(_recursive_build(sub_part_a_a_b.nodes[0], _make_MBV(sub_part_a_a_b.nodes[0][0])));
						final_nodes.push(_recursive_build(sub_part_a_a_b.nodes[1], _make_MBV(sub_part_a_a_b.nodes[1][0])));
					}
					excluded_axis.pop();
				}
			}
			number_of_objects = sub_part_a.nodes[1][0].length;
			if(number_of_objects <= _Max_Leaf) {
					final_nodes.push(BoxNode(_make_MBV(sub_part_a.nodes[1][0]), sub_part_a.nodes[1][0]));
			} else {
				var sub_part_a_b = _build_subpart(sub_part_a.nodes[1], _make_MBV(sub_part_a.nodes[1][0]), excluded_axis);
				excluded_axis.push(sub_part_a_b.axis);
				if(!use8WayNodes){
					final_nodes.push(_recursive_build(sub_part_a_b.nodes[0], _make_MBV(sub_part_a_b.nodes[0][0])));
					final_nodes.push(_recursive_build(sub_part_a_b.nodes[1], _make_MBV(sub_part_a_b.nodes[1][0])));
				} else {
					number_of_objects = sub_part_a_b.nodes[0][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_b.nodes[0][0]), sub_part_a_b.nodes[0][0]));
					} else {
							var sub_part_a_b_a = _build_subpart(sub_part_a_b.nodes[0],  _make_MBV(sub_part_a_b.nodes[0][0]), excluded_axis);
							final_nodes.push(_recursive_build(sub_part_a_b_a.nodes[0], _make_MBV(sub_part_a_b_a.nodes[0][0])));
							final_nodes.push(_recursive_build(sub_part_a_b_a.nodes[1], _make_MBV(sub_part_a_b_a.nodes[1][0])));
					}

					number_of_objects = sub_part_a_b.nodes[1][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_b.nodes[1][0]), sub_part_a_b.nodes[1][0]));
					} else {
							var sub_part_a_b_b = _build_subpart(sub_part_a_b.nodes[1],  _make_MBV(sub_part_a_b.nodes[1][0]), excluded_axis);
							final_nodes.push(_recursive_build(sub_part_a_b_b.nodes[0], _make_MBV(sub_part_a_b_b.nodes[0][0])));
							final_nodes.push(_recursive_build(sub_part_a_b_b.nodes[1], _make_MBV(sub_part_a_b_b.nodes[1][0])));
					}
				}
			}
			return BoxNode(_make_MBV(final_nodes), final_nodes);  
		}
		
		var _incremental_build = function(unfinished_node){
			var sorted_arrays_of_nodes = unfinished_node.s;
			var AABB = unfinished_node.i;
			var number_of_objects = sorted_arrays_of_nodes[0].length;

			if(number_of_objects <= _Max_Leaf) return BoxNode(_make_MBV(sorted_arrays_of_nodes[0]), sorted_arrays_of_nodes[0]);
			var final_nodes = [];

			var sub_part_a = _build_subpart(sorted_arrays_of_nodes, AABB, []);
			var do_axis = sub_part_a.axis;

			number_of_objects = sub_part_a.nodes[0][0].length;
			if(number_of_objects <= _Max_Leaf) {
					final_nodes.push(BoxNode(_make_MBV(sub_part_a.nodes[0][0]), sub_part_a.nodes[0][0]));
			} else {
				var sub_part_a_a = _build_subpart(sub_part_a.nodes[0], _make_MBV(sub_part_a.nodes[0][0]), do_axis);
				if(!use8WayNodes){
					final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_a.nodes[0][0]), sub_part_a_a.nodes[0]));
					final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_a.nodes[1][0]), sub_part_a_a.nodes[1]));
				} else {
					number_of_objects = sub_part_a_a.nodes[0][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_a.nodes[0][0]), sub_part_a_a.nodes[0][0]));
					} else {
						var sub_part_a_a_a = _build_subpart(sub_part_a_a.nodes[0], _make_MBV(sub_part_a_a.nodes[0][0])/*, excluded_axis*/);
						final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_a_a.nodes[0][0]), sub_part_a_a_a.nodes[0]));
						final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_a_a.nodes[1][0]), sub_part_a_a_a.nodes[1]));
					}
					number_of_objects = sub_part_a_a.nodes[1][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_a.nodes[1][0]), sub_part_a_a.nodes[1][0]));
					} else {
						var sub_part_a_a_b = _build_subpart(sub_part_a_a.nodes[1],  _make_MBV(sub_part_a_a.nodes[1][0])/*, excluded_axis*/);
						final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_a_b.nodes[0][0]), sub_part_a_a_b.nodes[0]));
						final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_a_b.nodes[1][0]), sub_part_a_a_b.nodes[1]));
					}
				}
			}
			number_of_objects = sub_part_a.nodes[1][0].length;
			if(number_of_objects <= _Max_Leaf) {
					final_nodes.push(BoxNode(_make_MBV(sub_part_a.nodes[1][0]), sub_part_a.nodes[1][0]));
			} else {
				var sub_part_a_b = _build_subpart(sub_part_a.nodes[1], _make_MBV(sub_part_a.nodes[1][0]), do_axis);
				if(!use8WayNodes){
					final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_b.nodes[0][0]), sub_part_a_b.nodes[0]));
					final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_b.nodes[1][0]), sub_part_a_b.nodes[1]));
				} else {
					number_of_objects = sub_part_a_b.nodes[0][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_b.nodes[0][0]), sub_part_a_b.nodes[0][0]));
					} else {
							var sub_part_a_b_a = _build_subpart(sub_part_a_b.nodes[0],  _make_MBV(sub_part_a_b.nodes[0][0])/*, excluded_axis*/);
							final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_b_a.nodes[0][0]), sub_part_a_b_a.nodes[0]));
							final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_b_a.nodes[1][0]), sub_part_a_b_a.nodes[1]));
					}

					number_of_objects = sub_part_a_b.nodes[1][0].length;
					if(number_of_objects <= _Max_Leaf) {
							final_nodes.push(BoxNode(_make_MBV(sub_part_a_b.nodes[1][0]), sub_part_a_b.nodes[1][0]));
					} else {
							var sub_part_a_b_b = _build_subpart(sub_part_a_b.nodes[1],  _make_MBV(sub_part_a_b.nodes[1][0])/*, excluded_axis*/);
							final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_b_b.nodes[0][0]), sub_part_a_b_b.nodes[0]));
							final_nodes.push(UnfinishedNode(_make_MBV(sub_part_a_b_b.nodes[1][0]), sub_part_a_b_b.nodes[1]));
					}
				}
			}
			return BoxNode(_make_MBV(final_nodes), final_nodes);
		}
		
		var _build_subpart = function(sorted_arrays_of_nodes, AABB, excluded_axis){
			var best_split = _get_lowest_cost(sorted_arrays_of_nodes, AABB, excluded_axis);
			var new_arrays_of_sorted_nodes = _split_node_arrays(sorted_arrays_of_nodes, best_split.axis, best_split.index,best_split.left, best_split.right);
			return {axis: best_split.axis, nodes:new_arrays_of_sorted_nodes};
		}

		this.build = function(array_of_nodes, force_build){
			//make sorted lists of nodes. one list per axis sorted by bounds starts
			var sorted_arrays_of_nodes = _make_sorted_arrays(array_of_nodes);
			//var sorted_arrays_of_nodes = sorted_insert(array_of_nodes);
			this.i = _make_MBV(array_of_nodes);
			if(force_build)
				_T = _recursive_build(sorted_arrays_of_nodes, this.i);
			else
				_T = UnfinishedNode(this.i, sorted_arrays_of_nodes);
			//console.log(_T);
		}

		var _clip_Ray_End = function (ray, axis, split_plane) {
			// The ray exits the volume between the planes so
			// we need to clip the ray end for this case
			var tdist = (split_plane - ray[axis].a) / (ray[axis].b - ray[axis].a);
			// if(tdist < 0 ) throw "What!";
			var ret_rs = [];
			for (var i = 0; i < _Dimensions; i++) {
				if (i !== axis) {
					ret_rs.push({
						a: ray[i].a,
						b: ray[i].a + (ray[i].b - ray[i].a) * tdist
					});
				} else {
					ret_rs.push({
						a: ray[i].a,
						b: split_plane
					});
				}
			}
			return ret_rs;
		};

		// Intersect with overall tree bounding-box
		// Returns a segment contained within the pointing box
		var _intersect_aabb = function (ray, box, segment) {
			var i, j;
			var parameters = [
				[],
				[]
			];
			// inv_direction and sign can be pre-computed per ray
			var inv_direction = [];
			var sign = [];

			// Initialize values
			for (i = 0; i < _Dimensions; i++) {
				parameters[0].push(box[i].a);
				parameters[1].push(box[i].a + box[i].b);
				if(segment){
					j = 1 / (ray[i].b - ray[i].a);
				} else {
					j = 1 / ray[i].b;
				}
				inv_direction.push(j);
				sign.push((j <= 0) ? 1 : 0);
			}

			var omin, omax, tmin, tmax;
			var tmin_a, tmin_b, tmax_a, tmax_b;

			omin = (parameters[sign[0]][0] - ray[0].a) * inv_direction[0];
			omax = (parameters[1 - sign[0]][0] - ray[0].a) * inv_direction[0];

			for (i = 1; i < _Dimensions; i++) {
				tmin = (parameters[sign[i]][i] - ray[i].a) * inv_direction[i];
				tmax = (parameters[1 - sign[i]][i] - ray[i].a) * inv_direction[i];

				if ((omin > tmax) || (tmin > omax)) {
					return false;
				}
				if (tmin > omin) {
					omin = tmin;
				}
				if (tmax < omax) {
					omax = tmax;
				}
			}
			if (omin >= Infinity || omax <= -Infinity) {
				return false;
			}

			if(segment){
				 if (omin > 1 || omax < 0 /*|| omax > 1*/) {
					return false;
				}
				if (omax > 1) omax = 1;
			}

			if (omin < 0 && omax < 0) return false;
			if (omin < 0) omin = 0;

			var rs = _make_Empty();
			if(segment){
				for (i = 0; i < _Dimensions; i++) {
					rs[i].a = ray[i].a + (ray[i].b-ray[i].a) * omin;
					rs[i].b = ray[i].a + (ray[i].b-ray[i].a) * omax;
				} 
			} else {
				for (i = 0; i < _Dimensions; i++) {
					rs[i].a = ray[i].a + ray[i].b * omin;
					rs[i].b = ray[i].a + ray[i].b * omax;
				}
			}
			return (rs);
		};

		var _intersect_Segment_AABB = function (ray, box) {
			var i, j;
			var parameters = [
				[],
				[]
			];
			// inv_direction and sign can be pre-computed per ray
			var inv_direction = [];
			var sign = [];

			// Initialize values
			for (i = 0; i < _Dimensions; i++) {
				parameters[0].push(box[i].a);
				parameters[1].push(box[i].a + box[i].b);
				j = 1 / (ray[i].b - ray[i].a);
				inv_direction.push(j);
				sign.push((j <= 0) ? 1 : 0);
			}

			var omin, omax, tmin, tmax;

			omin = (parameters[sign[0]][0] - ray[0].a) * inv_direction[0];
			omax = (parameters[1 - sign[0]][0] - ray[0].a) * inv_direction[0];

			for (i = 1; i < _Dimensions; i++) {
				tmin = (parameters[sign[i]][i] - ray[i].a) * inv_direction[i];
				tmax = (parameters[1 - sign[i]][i] - ray[i].a) * inv_direction[i];

				if ((omin > tmax) || (tmin > omax)) return false;
				if (tmin > omin) omin = tmin;
				if (tmax < omax) omax = tmax;
			}
			if (omin >= Infinity || omax <= -Infinity) {
				return false;
			}

			if (omin > 1 || omax < 0) {
				return false;
			}
			if (omax > 1) omax = 1;
			if (omin < 0) omin = 0;

			var rs = _make_Empty();
			var d;
			for (i = 0; i < _Dimensions; i++) {
				d = ray[i].b - ray[i].a;
				rs[i].a = ray[i].a + d * omin;
				rs[i].b = ray[i].a + d * omax;
			}
			return (rs);
		};

		/* non-recursive internal search function
		 * [ nodes | objects ] = _search_subtree(intervals, [return node data], [array to fill], root to begin search at)
		 * @private
		 */
		var _search_subtree = function (options) {
			var parent_stack = []; // Contains the elements that overlap
			var intervals = options.intervals;
			var return_node = options.return_nodes;
			var return_array = options.return_array;
			var root = _T, nodes, i;

			if (!_overlap_intervals(intervals, root.i)) return (return_array);

			// We must cheat if the root of the tree is a leaf
			if("n" in _T)
				parent_stack.push(_T);
			else
				parent_stack.push({n:[_T]});

			do {
				parent_node = parent_stack.pop();
				nodes = parent_node.n;
	//			var nodes = hit_stack.pop();
				i = nodes.length;

				while(i--) {
					var ltree = nodes[i];
					if(ltree.s) { // An unfinished node!
						ltree = _incremental_build(ltree);
						parent_node.n[i] = ltree;
					}

					if (_overlap_intervals(intervals, ltree.i)) {
						if (ltree.n) { // Not a Leaf
							parent_stack.push(ltree);
						} else if (ltree.o) { // A Leaf !!
							return_array.push(ltree.o);
//							return_array = return_array.concat(ltree.o);
						}
					}
				}
			} while (parent_stack.length > 0);

			return (return_array);
		};

		/* non-recursive search function 
		 * [ nodes | objects ] = NTree.search(intervals, [return node data], [array to fill])
		 * @public
		 */
		this.search = function (options) {
			if (arguments.length < 1) {
				throw "Wrong number of arguments. search() requires an options object."
			}
			if (options.intervals.length != _Dimensions) {
				throw "Wrong number of dimensions in input volume. The tree has a rank of " + _Dimensions + "-dimensions.";
			}
			if (!("return_array" in options)) {
				options.return_array = [];
			}
			return (_search_subtree.apply(this, [options]));
		}; /* End of NTree.search() */

	};

})();