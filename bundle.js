
(function(l, i, v, e) { v = l.createElement(i); v.async = 1; v.src = '//' + (location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; e = l.getElementsByTagName(i)[0]; e.parentNode.insertBefore(v, e)})(document, 'script');
var app = (function () {
	'use strict';

	function noop() {}

	const identity = x => x;

	function assign(tar, src) {
		for (const k in src) tar[k] = src[k];
		return tar;
	}

	function add_location(element, file, line, column, char) {
		element.__svelte_meta = {
			loc: { file, line, column, char }
		};
	}

	function run(fn) {
		return fn();
	}

	function blank_object() {
		return Object.create(null);
	}

	function run_all(fns) {
		fns.forEach(run);
	}

	function is_function(thing) {
		return typeof thing === 'function';
	}

	function safe_not_equal(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function validate_store(store, name) {
		if (!store || typeof store.subscribe !== 'function') {
			throw new Error(`'${name}' is not a store with a 'subscribe' method`);
		}
	}

	function subscribe(component, store, callback) {
		const unsub = store.subscribe(callback);

		component.$$.on_destroy.push(unsub.unsubscribe
			? () => unsub.unsubscribe()
			: unsub);
	}

	function create_slot(definition, ctx, fn) {
		if (definition) {
			const slot_ctx = get_slot_context(definition, ctx, fn);
			return definition[0](slot_ctx);
		}
	}

	function get_slot_context(definition, ctx, fn) {
		return definition[1]
			? assign({}, assign(ctx.$$scope.ctx, definition[1](fn ? fn(ctx) : {})))
			: ctx.$$scope.ctx;
	}

	function get_slot_changes(definition, ctx, changed, fn) {
		return definition[1]
			? assign({}, assign(ctx.$$scope.changed || {}, definition[1](fn ? fn(changed) : {})))
			: ctx.$$scope.changed || {};
	}

	let now = typeof window !== 'undefined'
		? () => window.performance.now()
		: () => Date.now();

	const tasks = new Set();
	let running = false;

	function run_tasks() {
		tasks.forEach(task => {
			if (!task[0](now())) {
				tasks.delete(task);
				task[1]();
			}
		});

		running = tasks.size > 0;
		if (running) requestAnimationFrame(run_tasks);
	}

	function loop(fn) {
		let task;

		if (!running) {
			running = true;
			requestAnimationFrame(run_tasks);
		}

		return {
			promise: new Promise(fulfil => {
				tasks.add(task = [fn, fulfil]);
			}),
			abort() {
				tasks.delete(task);
			}
		};
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor || null);
	}

	function detach(node) {
		node.parentNode.removeChild(node);
	}

	function element(name) {
		return document.createElement(name);
	}

	function svg_element(name) {
		return document.createElementNS('http://www.w3.org/2000/svg', name);
	}

	function text(data) {
		return document.createTextNode(data);
	}

	function space() {
		return text(' ');
	}

	function empty() {
		return text('');
	}

	function listen(node, event, handler, options) {
		node.addEventListener(event, handler, options);
		return () => node.removeEventListener(event, handler, options);
	}

	function attr(node, attribute, value) {
		if (value == null) node.removeAttribute(attribute);
		else node.setAttribute(attribute, value);
	}

	function children(element) {
		return Array.from(element.childNodes);
	}

	function set_data(text, data) {
		data = '' + data;
		if (text.data !== data) text.data = data;
	}

	function custom_event(type, detail) {
		const e = document.createEvent('CustomEvent');
		e.initCustomEvent(type, false, false, detail);
		return e;
	}

	let stylesheet;
	let active = 0;
	let current_rules = {};

	// https://github.com/darkskyapp/string-hash/blob/master/index.js
	function hash(str) {
		let hash = 5381;
		let i = str.length;

		while (i--) hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
		return hash >>> 0;
	}

	function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
		const step = 16.666 / duration;
		let keyframes = '{\n';

		for (let p = 0; p <= 1; p += step) {
			const t = a + (b - a) * ease(p);
			keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
		}

		const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
		const name = `__svelte_${hash(rule)}_${uid}`;

		if (!current_rules[name]) {
			if (!stylesheet) {
				const style = element('style');
				document.head.appendChild(style);
				stylesheet = style.sheet;
			}

			current_rules[name] = true;
			stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
		}

		const animation = node.style.animation || '';
		node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;

		active += 1;
		return name;
	}

	function delete_rule(node, name) {
		node.style.animation = (node.style.animation || '')
			.split(', ')
			.filter(name
				? anim => anim.indexOf(name) < 0 // remove specific animation
				: anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
			)
			.join(', ');

		if (name && !--active) clear_rules();
	}

	function clear_rules() {
		requestAnimationFrame(() => {
			if (active) return;
			let i = stylesheet.cssRules.length;
			while (i--) stylesheet.deleteRule(i);
			current_rules = {};
		});
	}

	let current_component;

	function set_current_component(component) {
		current_component = component;
	}

	function get_current_component() {
		if (!current_component) throw new Error(`Function called outside component initialization`);
		return current_component;
	}

	function onDestroy(fn) {
		get_current_component().$$.on_destroy.push(fn);
	}

	const dirty_components = [];

	const resolved_promise = Promise.resolve();
	let update_scheduled = false;
	const binding_callbacks = [];
	const render_callbacks = [];
	const flush_callbacks = [];

	function schedule_update() {
		if (!update_scheduled) {
			update_scheduled = true;
			resolved_promise.then(flush);
		}
	}

	function add_render_callback(fn) {
		render_callbacks.push(fn);
	}

	function flush() {
		const seen_callbacks = new Set();

		do {
			// first, call beforeUpdate functions
			// and update components
			while (dirty_components.length) {
				const component = dirty_components.shift();
				set_current_component(component);
				update(component.$$);
			}

			while (binding_callbacks.length) binding_callbacks.shift()();

			// then, once components are updated, call
			// afterUpdate functions. This may cause
			// subsequent updates...
			while (render_callbacks.length) {
				const callback = render_callbacks.pop();
				if (!seen_callbacks.has(callback)) {
					callback();

					// ...so guard against infinite loops
					seen_callbacks.add(callback);
				}
			}
		} while (dirty_components.length);

		while (flush_callbacks.length) {
			flush_callbacks.pop()();
		}

		update_scheduled = false;
	}

	function update($$) {
		if ($$.fragment) {
			$$.update($$.dirty);
			run_all($$.before_render);
			$$.fragment.p($$.dirty, $$.ctx);
			$$.dirty = null;

			$$.after_render.forEach(add_render_callback);
		}
	}

	let promise;

	function wait() {
		if (!promise) {
			promise = Promise.resolve();
			promise.then(() => {
				promise = null;
			});
		}

		return promise;
	}

	function dispatch(node, direction, kind) {
		node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
	}

	let outros;

	function group_outros() {
		outros = {
			remaining: 0,
			callbacks: []
		};
	}

	function check_outros() {
		if (!outros.remaining) {
			run_all(outros.callbacks);
		}
	}

	function on_outro(callback) {
		outros.callbacks.push(callback);
	}

	function create_out_transition(node, fn, params) {
		let config = fn(node, params);
		let running = true;
		let animation_name;

		const group = outros;

		group.remaining += 1;

		function go() {
			const {
				delay = 0,
				duration = 300,
				easing = identity,
				tick: tick$$1 = noop,
				css
			} = config;

			if (css) animation_name = create_rule(node, 1, 0, duration, delay, easing, css);

			const start_time = now() + delay;
			const end_time = start_time + duration;

			loop(now$$1 => {
				if (running) {
					if (now$$1 >= end_time) {
						tick$$1(0, 1);

						if (!--group.remaining) {
							// this will result in `end()` being called,
							// so we don't need to clean up here
							run_all(group.callbacks);
						}

						return false;
					}

					if (now$$1 >= start_time) {
						const t = easing((now$$1 - start_time) / duration);
						tick$$1(1 - t, t);
					}
				}

				return running;
			});
		}

		if (typeof config === 'function') {
			wait().then(() => {
				config = config();
				go();
			});
		} else {
			go();
		}

		return {
			end(reset) {
				if (reset && config.tick) {
					config.tick(1, 0);
				}

				if (running) {
					if (animation_name) delete_rule(node, animation_name);
					running = false;
				}
			}
		};
	}

	function create_bidirectional_transition(node, fn, params, intro) {
		let config = fn(node, params);

		let t = intro ? 0 : 1;

		let running_program = null;
		let pending_program = null;
		let animation_name = null;

		function clear_animation() {
			if (animation_name) delete_rule(node, animation_name);
		}

		function init(program, duration) {
			const d = program.b - t;
			duration *= Math.abs(d);

			return {
				a: t,
				b: program.b,
				d,
				duration,
				start: program.start,
				end: program.start + duration,
				group: program.group
			};
		}

		function go(b) {
			const {
				delay = 0,
				duration = 300,
				easing = identity,
				tick: tick$$1 = noop,
				css
			} = config;

			const program = {
				start: now() + delay,
				b
			};

			if (!b) {
				program.group = outros;
				outros.remaining += 1;
			}

			if (running_program) {
				pending_program = program;
			} else {
				// if this is an intro, and there's a delay, we need to do
				// an initial tick and/or apply CSS animation immediately
				if (css) {
					clear_animation();
					animation_name = create_rule(node, t, b, duration, delay, easing, css);
				}

				if (b) tick$$1(0, 1);

				running_program = init(program, duration);
				add_render_callback(() => dispatch(node, b, 'start'));

				loop(now$$1 => {
					if (pending_program && now$$1 > pending_program.start) {
						running_program = init(pending_program, duration);
						pending_program = null;

						dispatch(node, running_program.b, 'start');

						if (css) {
							clear_animation();
							animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
						}
					}

					if (running_program) {
						if (now$$1 >= running_program.end) {
							tick$$1(t = running_program.b, 1 - t);
							dispatch(node, running_program.b, 'end');

							if (!pending_program) {
								// we're done
								if (running_program.b) {
									// intro — we can tidy up immediately
									clear_animation();
								} else {
									// outro — needs to be coordinated
									if (!--running_program.group.remaining) run_all(running_program.group.callbacks);
								}
							}

							running_program = null;
						}

						else if (now$$1 >= running_program.start) {
							const p = now$$1 - running_program.start;
							t = running_program.a + running_program.d * easing(p / running_program.duration);
							tick$$1(t, 1 - t);
						}
					}

					return !!(running_program || pending_program);
				});
			}
		}

		return {
			run(b) {
				if (typeof config === 'function') {
					wait().then(() => {
						config = config();
						go(b);
					});
				} else {
					go(b);
				}
			},

			end() {
				clear_animation();
				running_program = pending_program = null;
			}
		};
	}

	function destroy_block(block, lookup) {
		block.d(1);
		lookup.delete(block.key);
	}

	function outro_and_destroy_block(block, lookup) {
		on_outro(() => {
			destroy_block(block, lookup);
		});

		block.o(1);
	}

	function update_keyed_each(old_blocks, changed, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
		let o = old_blocks.length;
		let n = list.length;

		let i = o;
		const old_indexes = {};
		while (i--) old_indexes[old_blocks[i].key] = i;

		const new_blocks = [];
		const new_lookup = new Map();
		const deltas = new Map();

		i = n;
		while (i--) {
			const child_ctx = get_context(ctx, list, i);
			const key = get_key(child_ctx);
			let block = lookup.get(key);

			if (!block) {
				block = create_each_block(key, child_ctx);
				block.c();
			} else if (dynamic) {
				block.p(changed, child_ctx);
			}

			new_lookup.set(key, new_blocks[i] = block);

			if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
		}

		const will_move = new Set();
		const did_move = new Set();

		function insert(block) {
			if (block.i) block.i(1);
			block.m(node, next);
			lookup.set(block.key, block);
			next = block.first;
			n--;
		}

		while (o && n) {
			const new_block = new_blocks[n - 1];
			const old_block = old_blocks[o - 1];
			const new_key = new_block.key;
			const old_key = old_block.key;

			if (new_block === old_block) {
				// do nothing
				next = new_block.first;
				o--;
				n--;
			}

			else if (!new_lookup.has(old_key)) {
				// remove old block
				destroy(old_block, lookup);
				o--;
			}

			else if (!lookup.has(new_key) || will_move.has(new_key)) {
				insert(new_block);
			}

			else if (did_move.has(old_key)) {
				o--;

			} else if (deltas.get(new_key) > deltas.get(old_key)) {
				did_move.add(new_key);
				insert(new_block);

			} else {
				will_move.add(old_key);
				o--;
			}
		}

		while (o--) {
			const old_block = old_blocks[o];
			if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
		}

		while (n) insert(new_blocks[n - 1]);

		return new_blocks;
	}

	function mount_component(component, target, anchor) {
		const { fragment, on_mount, on_destroy, after_render } = component.$$;

		fragment.m(target, anchor);

		// onMount happens after the initial afterUpdate. Because
		// afterUpdate callbacks happen in reverse order (inner first)
		// we schedule onMount callbacks before afterUpdate callbacks
		add_render_callback(() => {
			const new_on_destroy = on_mount.map(run).filter(is_function);
			if (on_destroy) {
				on_destroy.push(...new_on_destroy);
			} else {
				// Edge case - component was destroyed immediately,
				// most likely as a result of a binding initialising
				run_all(new_on_destroy);
			}
			component.$$.on_mount = [];
		});

		after_render.forEach(add_render_callback);
	}

	function destroy(component, detaching) {
		if (component.$$) {
			run_all(component.$$.on_destroy);
			component.$$.fragment.d(detaching);

			// TODO null out other refs, including component.$$ (but need to
			// preserve final state?)
			component.$$.on_destroy = component.$$.fragment = null;
			component.$$.ctx = {};
		}
	}

	function make_dirty(component, key) {
		if (!component.$$.dirty) {
			dirty_components.push(component);
			schedule_update();
			component.$$.dirty = blank_object();
		}
		component.$$.dirty[key] = true;
	}

	function init(component, options, instance, create_fragment, not_equal$$1, prop_names) {
		const parent_component = current_component;
		set_current_component(component);

		const props = options.props || {};

		const $$ = component.$$ = {
			fragment: null,
			ctx: null,

			// state
			props: prop_names,
			update: noop,
			not_equal: not_equal$$1,
			bound: blank_object(),

			// lifecycle
			on_mount: [],
			on_destroy: [],
			before_render: [],
			after_render: [],
			context: new Map(parent_component ? parent_component.$$.context : []),

			// everything else
			callbacks: blank_object(),
			dirty: null
		};

		let ready = false;

		$$.ctx = instance
			? instance(component, props, (key, value) => {
				if ($$.ctx && not_equal$$1($$.ctx[key], $$.ctx[key] = value)) {
					if ($$.bound[key]) $$.bound[key](value);
					if (ready) make_dirty(component, key);
				}
			})
			: props;

		$$.update();
		ready = true;
		run_all($$.before_render);
		$$.fragment = create_fragment($$.ctx);

		if (options.target) {
			if (options.hydrate) {
				$$.fragment.l(children(options.target));
			} else {
				$$.fragment.c();
			}

			if (options.intro && component.$$.fragment.i) component.$$.fragment.i();
			mount_component(component, options.target, options.anchor);
			flush();
		}

		set_current_component(parent_component);
	}

	class SvelteComponent {
		$destroy() {
			destroy(this, true);
			this.$destroy = noop;
		}

		$on(type, callback) {
			const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
			callbacks.push(callback);

			return () => {
				const index = callbacks.indexOf(callback);
				if (index !== -1) callbacks.splice(index, 1);
			};
		}

		$set() {
			// overridden by instance, if it has props
		}
	}

	class SvelteComponentDev extends SvelteComponent {
		constructor(options) {
			if (!options || (!options.target && !options.$$inline)) {
				throw new Error(`'target' is a required option`);
			}

			super();
		}

		$destroy() {
			super.$destroy();
			this.$destroy = () => {
				console.warn(`Component was already destroyed`); // eslint-disable-line no-console
			};
		}
	}

	/* src/components/IconButton.svelte generated by Svelte v3.4.1 */

	const file = "src/components/IconButton.svelte";

	function create_fragment(ctx) {
		var button, button_class_value, current, dispose;

		const default_slot_1 = ctx.$$slots.default;
		const default_slot = create_slot(default_slot_1, ctx, null);

		return {
			c: function create() {
				button = element("button");

				if (default_slot) default_slot.c();

				button.className = button_class_value = "" + (`iconButton ${ctx.active ? 'active' : ''}`) + " svelte-121zshi";
				add_location(button, file, 23, 0, 378);

				dispose = [
					listen(button, "mousedown", ctx.start),
					listen(button, "touchstart", ctx.start),
					listen(button, "mouseup", ctx.release),
					listen(button, "touchend", ctx.release)
				];
			},

			l: function claim(nodes) {
				if (default_slot) default_slot.l(button_nodes);
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, button, anchor);

				if (default_slot) {
					default_slot.m(button, null);
				}

				current = true;
			},

			p: function update(changed, ctx) {
				if (default_slot && default_slot.p && changed.$$scope) {
					default_slot.p(get_slot_changes(default_slot_1, ctx, changed, null), get_slot_context(default_slot_1, ctx, null));
				}

				if ((!current || changed.active) && button_class_value !== (button_class_value = "" + (`iconButton ${ctx.active ? 'active' : ''}`) + " svelte-121zshi")) {
					button.className = button_class_value;
				}
			},

			i: function intro(local) {
				if (current) return;
				if (default_slot && default_slot.i) default_slot.i(local);
				current = true;
			},

			o: function outro(local) {
				if (default_slot && default_slot.o) default_slot.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(button);
				}

				if (default_slot) default_slot.d(detaching);
				run_all(dispose);
			}
		};
	}

	function instance($$self, $$props, $$invalidate) {
		let { start, release, active } = $$props;

		let { $$slots = {}, $$scope } = $$props;

		$$self.$set = $$props => {
			if ('start' in $$props) $$invalidate('start', start = $$props.start);
			if ('release' in $$props) $$invalidate('release', release = $$props.release);
			if ('active' in $$props) $$invalidate('active', active = $$props.active);
			if ('$$scope' in $$props) $$invalidate('$$scope', $$scope = $$props.$$scope);
		};

		return { start, release, active, $$slots, $$scope };
	}

	class IconButton extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance, create_fragment, safe_not_equal, ["start", "release", "active"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.start === undefined && !('start' in props)) {
				console.warn("<IconButton> was created without expected prop 'start'");
			}
			if (ctx.release === undefined && !('release' in props)) {
				console.warn("<IconButton> was created without expected prop 'release'");
			}
			if (ctx.active === undefined && !('active' in props)) {
				console.warn("<IconButton> was created without expected prop 'active'");
			}
		}

		get start() {
			throw new Error("<IconButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set start(value) {
			throw new Error("<IconButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get release() {
			throw new Error("<IconButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set release(value) {
			throw new Error("<IconButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		get active() {
			throw new Error("<IconButton>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set active(value) {
			throw new Error("<IconButton>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/assets/LeftArrow.svelte generated by Svelte v3.4.1 */

	const file$1 = "src/assets/LeftArrow.svelte";

	function create_fragment$1(ctx) {
		var svg, path;

		return {
			c: function create() {
				svg = svg_element("svg");
				path = svg_element("path");
				attr(path, "d", "M222.979,5.424C219.364,1.807,215.08,0,210.132,0c-4.949,0-9.233,1.807-12.848,5.424L69.378,133.331\n    c-3.615,3.617-5.424,7.898-5.424,12.847c0,4.949,1.809,9.233,5.424,12.847l127.906,127.907c3.614,3.617,7.898,5.428,12.848,5.428\n    c4.948,0,9.232-1.811,12.847-5.428c3.617-3.614,5.427-7.898,5.427-12.847V18.271C228.405,13.322,226.596,9.042,222.979,5.424z");
				add_location(path, file$1, 5, 2, 101);
				attr(svg, "width", "40px");
				attr(svg, "height", "40px");
				attr(svg, "viewBox", "0 0 292.359 292.359");
				attr(svg, "transform", "translate(-5 0)");
				add_location(svg, file$1, 0, 0, 0);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, svg, anchor);
				append(svg, path);
			},

			p: noop,
			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(svg);
				}
			}
		};
	}

	class LeftArrow extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, null, create_fragment$1, safe_not_equal, []);
		}
	}

	/* src/assets/RightArrow.svelte generated by Svelte v3.4.1 */

	const file$2 = "src/assets/RightArrow.svelte";

	function create_fragment$2(ctx) {
		var svg, path;

		return {
			c: function create() {
				svg = svg_element("svg");
				path = svg_element("path");
				attr(path, "d", "M222.979,5.424C219.364,1.807,215.08,0,210.132,0c-4.949,0-9.233,1.807-12.848,5.424L69.378,133.331\n    c-3.615,3.617-5.424,7.898-5.424,12.847c0,4.949,1.809,9.233,5.424,12.847l127.906,127.907c3.614,3.617,7.898,5.428,12.848,5.428\n    c4.948,0,9.232-1.811,12.847-5.428c3.617-3.614,5.427-7.898,5.427-12.847V18.271C228.405,13.322,226.596,9.042,222.979,5.424z");
				add_location(path, file$2, 5, 2, 112);
				attr(svg, "width", "40px");
				attr(svg, "height", "40px");
				attr(svg, "viewBox", "0 0 292.359 292.359");
				attr(svg, "transform", "translate(5 0) rotate(180)");
				add_location(svg, file$2, 0, 0, 0);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, svg, anchor);
				append(svg, path);
			},

			p: noop,
			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(svg);
				}
			}
		};
	}

	class RightArrow extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, null, create_fragment$2, safe_not_equal, []);
		}
	}

	/* src/assets/Bullet.svelte generated by Svelte v3.4.1 */

	const file$3 = "src/assets/Bullet.svelte";

	function create_fragment$3(ctx) {
		var svg, path0, path1, path2, path3;

		return {
			c: function create() {
				svg = svg_element("svg");
				path0 = svg_element("path");
				path1 = svg_element("path");
				path2 = svg_element("path");
				path3 = svg_element("path");
				attr(path0, "d", "m341.652344 38.511719-37.839844 37.839843 46.960938 46.960938\n    37.839843-37.839844c8.503907-8.527344 15-18.839844\n    19.019531-30.191406l19.492188-55.28125-55.28125 19.492188c-11.351562\n    4.019531-21.664062 10.515624-30.191406 19.019531zm0 0");
				add_location(path0, file$3, 1, 2, 63);
				attr(path1, "d", "m258.65625 99.078125 69.390625 69.390625\n    14.425781-33.65625-50.160156-50.160156zm0 0");
				add_location(path1, file$3, 6, 2, 330);
				attr(path2, "d", "m.0429688 352.972656 28.2812502-28.285156 74.113281 74.113281-28.28125\n    28.28125zm0 0");
				add_location(path2, file$3, 9, 2, 438);
				attr(path3, "d", "m38.226562 314.789062 208.167969-208.171874 74.113281\n    74.113281-208.171874 208.171875zm0 0");
				add_location(path3, file$3, 12, 2, 546);
				attr(svg, "height", "40px");
				attr(svg, "viewBox", "0 0 427 427.08344");
				attr(svg, "width", "40px");
				add_location(svg, file$3, 0, 0, 0);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, svg, anchor);
				append(svg, path0);
				append(svg, path1);
				append(svg, path2);
				append(svg, path3);
			},

			p: noop,
			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(svg);
				}
			}
		};
	}

	class Bullet extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, null, create_fragment$3, safe_not_equal, []);
		}
	}

	function noop$1() {}

	function safe_not_equal$1(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}
	function writable(value, start = noop$1) {
	    let stop;
	    const subscribers = [];
	    function set(new_value) {
	        if (safe_not_equal$1(value, new_value)) {
	            value = new_value;
	            if (!stop) {
	                return; // not ready
	            }
	            subscribers.forEach((s) => s[1]());
	            subscribers.forEach((s) => s[0](value));
	        }
	    }
	    function update(fn) {
	        set(fn(value));
	    }
	    function subscribe$$1(run$$1, invalidate = noop$1) {
	        const subscriber = [run$$1, invalidate];
	        subscribers.push(subscriber);
	        if (subscribers.length === 1) {
	            stop = start(set) || noop$1;
	        }
	        run$$1(value);
	        return () => {
	            const index = subscribers.indexOf(subscriber);
	            if (index !== -1) {
	                subscribers.splice(index, 1);
	            }
	            if (subscribers.length === 0) {
	                stop();
	            }
	        };
	    }
	    return { set, update, subscribe: subscribe$$1 };
	}
	function get(store) {
	    let value;
	    store.subscribe((_) => value = _)();
	    return value;
	}

	const direction = writable(null);
	const angle = writable(0);
	const isFiring = writable(false);
	const lastFireAt = writable(0);
	const bulletList = writable([]);

	/* src/components/Controls.svelte generated by Svelte v3.4.1 */

	const file$4 = "src/components/Controls.svelte";

	// (85:6) <IconButton         start={setDirectionLeft}         release={resetDirection}         active={$direction === 'left'}>
	function create_default_slot_2(ctx) {
		var current;

		var leftarrow = new LeftArrow({ $$inline: true });

		return {
			c: function create() {
				leftarrow.$$.fragment.c();
			},

			m: function mount(target, anchor) {
				mount_component(leftarrow, target, anchor);
				current = true;
			},

			i: function intro(local) {
				if (current) return;
				leftarrow.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				leftarrow.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				leftarrow.$destroy(detaching);
			}
		};
	}

	// (91:6) <IconButton         start={setDirectionRight}         release={resetDirection}         active={$direction === 'right'}>
	function create_default_slot_1(ctx) {
		var current;

		var rightarrow = new RightArrow({ $$inline: true });

		return {
			c: function create() {
				rightarrow.$$.fragment.c();
			},

			m: function mount(target, anchor) {
				mount_component(rightarrow, target, anchor);
				current = true;
			},

			i: function intro(local) {
				if (current) return;
				rightarrow.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				rightarrow.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				rightarrow.$destroy(detaching);
			}
		};
	}

	// (98:4) <IconButton start={startFire} release={stopFire} active={$isFiring}>
	function create_default_slot(ctx) {
		var current;

		var bullet = new Bullet({ $$inline: true });

		return {
			c: function create() {
				bullet.$$.fragment.c();
			},

			m: function mount(target, anchor) {
				mount_component(bullet, target, anchor);
				current = true;
			},

			i: function intro(local) {
				if (current) return;
				bullet.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				bullet.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				bullet.$destroy(detaching);
			}
		};
	}

	function create_fragment$4(ctx) {
		var div2, div1, div0, t0, t1, current;

		var iconbutton0 = new IconButton({
			props: {
			start: ctx.setDirectionLeft,
			release: ctx.resetDirection,
			active: ctx.$direction === 'left',
			$$slots: { default: [create_default_slot_2] },
			$$scope: { ctx }
		},
			$$inline: true
		});

		var iconbutton1 = new IconButton({
			props: {
			start: ctx.setDirectionRight,
			release: ctx.resetDirection,
			active: ctx.$direction === 'right',
			$$slots: { default: [create_default_slot_1] },
			$$scope: { ctx }
		},
			$$inline: true
		});

		var iconbutton2 = new IconButton({
			props: {
			start: ctx.startFire,
			release: ctx.stopFire,
			active: ctx.$isFiring,
			$$slots: { default: [create_default_slot] },
			$$scope: { ctx }
		},
			$$inline: true
		});

		return {
			c: function create() {
				div2 = element("div");
				div1 = element("div");
				div0 = element("div");
				iconbutton0.$$.fragment.c();
				t0 = space();
				iconbutton1.$$.fragment.c();
				t1 = space();
				iconbutton2.$$.fragment.c();
				div0.className = "arrowGroup svelte-1d9v1w8";
				add_location(div0, file$4, 83, 4, 1883);
				div1.className = "container svelte-1d9v1w8";
				add_location(div1, file$4, 82, 2, 1855);
				div2.className = "controls svelte-1d9v1w8";
				add_location(div2, file$4, 81, 0, 1830);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div1);
				append(div1, div0);
				mount_component(iconbutton0, div0, null);
				append(div0, t0);
				mount_component(iconbutton1, div0, null);
				append(div1, t1);
				mount_component(iconbutton2, div1, null);
				current = true;
			},

			p: function update(changed, ctx) {
				var iconbutton0_changes = {};
				if (changed.setDirectionLeft) iconbutton0_changes.start = ctx.setDirectionLeft;
				if (changed.resetDirection) iconbutton0_changes.release = ctx.resetDirection;
				if (changed.$direction) iconbutton0_changes.active = ctx.$direction === 'left';
				if (changed.$$scope) iconbutton0_changes.$$scope = { changed, ctx };
				iconbutton0.$set(iconbutton0_changes);

				var iconbutton1_changes = {};
				if (changed.setDirectionRight) iconbutton1_changes.start = ctx.setDirectionRight;
				if (changed.resetDirection) iconbutton1_changes.release = ctx.resetDirection;
				if (changed.$direction) iconbutton1_changes.active = ctx.$direction === 'right';
				if (changed.$$scope) iconbutton1_changes.$$scope = { changed, ctx };
				iconbutton1.$set(iconbutton1_changes);

				var iconbutton2_changes = {};
				if (changed.startFire) iconbutton2_changes.start = ctx.startFire;
				if (changed.stopFire) iconbutton2_changes.release = ctx.stopFire;
				if (changed.$isFiring) iconbutton2_changes.active = ctx.$isFiring;
				if (changed.$$scope) iconbutton2_changes.$$scope = { changed, ctx };
				iconbutton2.$set(iconbutton2_changes);
			},

			i: function intro(local) {
				if (current) return;
				iconbutton0.$$.fragment.i(local);

				iconbutton1.$$.fragment.i(local);

				iconbutton2.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				iconbutton0.$$.fragment.o(local);
				iconbutton1.$$.fragment.o(local);
				iconbutton2.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(div2);
				}

				iconbutton0.$destroy();

				iconbutton1.$destroy();

				iconbutton2.$destroy();
			}
		};
	}

	function instance$1($$self, $$props, $$invalidate) {
		let $direction, $isFiring;

		validate_store(direction, 'direction');
		subscribe($$self, direction, $$value => { $direction = $$value; $$invalidate('$direction', $direction); });
		validate_store(isFiring, 'isFiring');
		subscribe($$self, isFiring, $$value => { $isFiring = $$value; $$invalidate('$isFiring', $isFiring); });

		

	  const resetDirection = () => direction.set(null);

	  const setDirectionLeft = () => direction.set("left");

	  const setDirectionRight = () => direction.set("right");

	  const startFire = () => isFiring.set(true);

	  const stopFire = () => isFiring.set(false);

	  function handleKeyDown(e) {
	    window.requestAnimationFrame(() => {
	      switch (e.keyCode) {
	        case 39:
	          setDirectionRight();
	          break;
	        case 37:
	          setDirectionLeft();
	          break;
	        case 32:
	          startFire();
	          break;
	        default:
	          return;
	      }
	    });
	  }

	  function handleKeyUp(e) {
	    window.requestAnimationFrame(() => {
	      switch (e.keyCode) {
	        case 39:
	          resetDirection();
	          break;
	        case 37:
	          resetDirection();
	          break;
	        case 32:
	          stopFire();
	          break;
	        default:
	          return;
	      }
	    });
	  }

	  document.body.addEventListener("keydown", handleKeyDown, false);
	  document.body.addEventListener("keyup", handleKeyUp, false);
	  onDestroy(() => {
	    document.body.removeEventListener("keydown", handleKeyDown);
	    document.body.removeEventListener("keyup", handleKeyUp);
	  });

		return {
			resetDirection,
			setDirectionLeft,
			setDirectionRight,
			startFire,
			stopFire,
			$direction,
			$isFiring
		};
	}

	class Controls extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$1, create_fragment$4, safe_not_equal, []);
		}
	}

	/* src/components/FpsMonitor.svelte generated by Svelte v3.4.1 */

	const file$5 = "src/components/FpsMonitor.svelte";

	function create_fragment$5(ctx) {
		var div, t0, t1;

		return {
			c: function create() {
				div = element("div");
				t0 = text(ctx.fps);
				t1 = text(" FPS");
				div.className = "fps svelte-jkyvnt";
				add_location(div, file$5, 31, 0, 574);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, t0);
				append(div, t1);
			},

			p: function update(changed, ctx) {
				if (changed.fps) {
					set_data(t0, ctx.fps);
				}
			},

			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(div);
				}
			}
		};
	}

	function instance$2($$self, $$props, $$invalidate) {
		let tickId = null;
	  const times = [];
	  let fps;

	  function refreshLoop() {
	    $$invalidate('tickId', tickId = window.requestAnimationFrame(() => {
	      const now = performance.now();
	      while (times.length > 0 && times[0] <= now - 1000) {
	        times.shift();
	      }
	      times.push(now);
	      $$invalidate('fps', fps = times.length);
	      refreshLoop();
	    }));
	  }
	  onDestroy(() => {
	    window.cancelAnimationFrame(tickId);
	  });
	  $$invalidate('tickId', tickId = refreshLoop());

		return { fps };
	}

	class FpsMonitor extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$2, create_fragment$5, safe_not_equal, []);
		}
	}

	/* src/components/Cannon.svelte generated by Svelte v3.4.1 */

	const file$6 = "src/components/Cannon.svelte";

	function create_fragment$6(ctx) {
		var g1, svg, g0, path0, path1, path2, path3, path4, g1_transform_value;

		return {
			c: function create() {
				g1 = svg_element("g");
				svg = svg_element("svg");
				g0 = svg_element("g");
				path0 = svg_element("path");
				path1 = svg_element("path");
				path2 = svg_element("path");
				path3 = svg_element("path");
				path4 = svg_element("path");
				attr(path0, "id", "path0");
				attr(path0, "d", "M0.000 202.800 L 0.000 405.600 200.000 405.600 L 400.000 405.600 400.000 202.800 L 400.000 0.000 200.000 0.000 L 0.000 0.000 0.000 202.800 M386.762 23.508 C 387.424 25.107,387.200 112.155,386.529 113.650 C 386.158 114.478,386.179 115.111,386.630 116.650 C 387.121 118.327,387.187 137.998,387.101 257.000 L 387.000 395.400 335.800 395.510 C 281.087 395.627,283.497 395.681,282.000 394.309 C 281.450 393.805,279.110 391.745,276.800 389.730 C 274.490 387.716,271.700 385.224,270.600 384.192 C 269.500 383.160,267.795 381.659,266.812 380.858 C 263.512 378.168,263.073 377.805,261.673 376.600 C 260.905 375.940,259.685 375.040,258.962 374.600 C 253.888 371.516,246.085 363.938,242.552 358.665 C 239.961 354.798,237.060 351.666,229.896 345.000 C 224.481 339.961,221.412 335.122,219.427 328.491 C 218.226 324.479,216.522 321.234,213.606 317.405 C 210.653 313.528,205.571 309.717,200.400 307.501 C 195.097 305.228,188.768 303.303,183.000 302.208 C 181.460 301.916,179.571 301.480,178.803 301.239 C 176.450 300.500,164.753 300.701,158.740 301.583 C 151.351 302.667,143.716 303.067,136.400 302.754 C 132.990 302.608,126.420 302.367,121.800 302.219 C 113.263 301.945,102.404 300.808,98.426 299.771 C 97.219 299.457,95.750 299.200,95.162 299.200 C 94.573 299.200,93.216 298.941,92.146 298.624 C 91.076 298.307,87.500 297.674,84.200 297.218 C 80.900 296.761,77.030 296.131,75.600 295.817 C 74.170 295.504,72.370 295.132,71.600 294.991 C 69.642 294.632,62.107 292.077,59.639 290.934 C 56.969 289.699,50.121 284.613,47.879 282.200 C 43.297 277.269,41.895 275.378,39.127 270.400 C 35.330 263.573,34.638 261.900,33.863 257.682 C 33.474 255.566,33.093 254.816,31.480 252.987 C 30.279 251.626,28.585 248.824,26.957 245.505 C 24.084 239.650,23.151 237.912,22.697 237.575 C 22.244 237.238,18.105 230.195,16.513 227.054 C 15.166 224.397,14.876 223.144,13.626 214.600 C 12.115 204.275,12.251 190.608,13.902 186.800 C 14.519 185.376,16.572 181.091,17.160 180.000 C 18.037 178.372,18.741 176.392,19.152 174.400 C 19.402 173.190,20.341 168.780,21.240 164.600 C 22.138 160.420,23.043 156.100,23.252 155.000 C 23.460 153.900,23.888 151.650,24.203 150.000 C 24.518 148.350,24.851 145.912,24.943 144.581 C 25.034 143.251,25.388 141.271,25.728 140.181 C 26.068 139.092,26.724 136.907,27.187 135.327 C 28.096 132.223,29.749 130.000,31.146 130.000 C 32.532 130.000,32.994 128.561,32.185 126.766 C 31.301 124.806,31.589 124.319,36.434 119.594 C 39.655 116.453,39.883 116.128,39.363 115.417 C 37.807 113.290,40.377 107.213,43.726 105.099 C 52.017 99.867,54.956 99.000,64.400 99.000 C 72.805 99.000,72.612 98.939,77.164 103.040 L 79.328 104.989 82.564 104.994 C 85.735 104.998,85.896 104.949,90.600 102.563 C 93.240 101.224,96.390 99.814,97.600 99.431 C 98.810 99.048,100.340 98.547,101.000 98.319 C 101.660 98.090,103.100 97.705,104.200 97.462 C 105.300 97.219,106.438 96.791,106.729 96.510 C 107.019 96.230,107.773 96.000,108.403 96.000 C 109.032 96.000,110.005 95.826,110.563 95.614 C 117.004 93.165,133.868 91.915,136.389 93.700 C 136.933 94.085,137.653 94.406,137.989 94.414 C 138.325 94.421,139.320 94.775,140.200 95.200 C 141.080 95.625,142.250 95.980,142.800 95.989 C 143.350 95.998,144.267 96.248,144.837 96.546 C 145.408 96.844,146.578 97.216,147.437 97.373 C 148.297 97.531,149.363 97.893,149.807 98.178 C 152.713 100.046,167.608 100.150,173.600 98.345 C 176.058 97.605,193.020 97.391,194.093 98.087 C 194.592 98.411,195.992 98.776,197.205 98.899 C 198.418 99.022,200.038 99.391,200.805 99.718 C 203.383 100.819,207.788 102.012,209.254 102.006 C 210.620 102.000,212.552 102.477,216.800 103.868 C 217.790 104.192,219.410 104.610,220.400 104.797 C 221.390 104.984,222.869 105.422,223.687 105.769 C 224.505 106.116,225.776 106.400,226.511 106.400 C 227.246 106.400,228.196 106.664,228.624 106.987 C 229.051 107.310,229.940 107.586,230.600 107.601 C 231.260 107.615,232.504 107.960,233.365 108.367 C 235.857 109.546,238.397 108.411,240.629 105.123 C 241.272 104.175,241.892 103.310,242.007 103.200 C 242.122 103.090,242.445 102.550,242.724 102.000 C 244.228 99.038,246.031 96.609,249.300 93.142 C 249.685 92.734,250.000 92.285,250.000 92.144 C 250.000 91.809,251.299 88.938,253.132 85.224 C 256.184 79.037,260.384 74.913,273.828 64.900 C 275.084 63.965,276.356 63.200,276.655 63.200 C 276.955 63.200,277.200 63.034,277.200 62.831 C 277.200 62.628,277.818 62.258,278.574 62.009 C 279.330 61.759,280.005 61.416,280.074 61.245 C 280.143 61.075,281.370 60.355,282.800 59.645 C 284.230 58.935,286.120 57.930,287.000 57.412 C 290.722 55.221,294.340 53.601,298.030 52.473 C 299.476 52.031,301.366 51.365,302.230 50.994 C 304.924 49.834,311.325 47.550,313.000 47.151 C 313.880 46.941,315.320 46.524,316.200 46.225 C 317.080 45.925,319.240 45.368,321.000 44.986 C 322.760 44.605,325.215 44.055,326.455 43.766 C 327.696 43.476,329.676 43.126,330.855 42.989 C 341.392 41.756,357.086 37.638,362.600 34.658 C 363.920 33.945,366.440 32.753,368.200 32.010 C 369.960 31.266,371.580 30.529,371.800 30.371 C 372.020 30.214,372.830 29.731,373.600 29.298 C 374.370 28.865,376.620 27.561,378.600 26.402 C 380.580 25.242,382.740 24.036,383.400 23.721 C 384.060 23.407,384.870 22.991,385.200 22.798 C 386.127 22.255,386.270 22.320,386.762 23.508 ");
				attr(path0, "stroke", "none");
				attr(path0, "fill", "#fbfbfb");
				attr(path0, "fill-rule", "evenodd");
				add_location(path0, file$6, 11, 170, 374);
				attr(path1, "id", "path1");
				attr(path1, "d", "M384.100 27.089 C 383.385 27.178,382.800 27.401,382.800 27.584 C 382.800 27.767,380.325 29.122,377.300 30.594 C 374.275 32.067,371.530 33.436,371.200 33.638 C 370.870 33.840,370.150 34.204,369.600 34.446 C 368.549 34.909,368.501 34.932,365.371 36.515 C 359.824 39.320,357.421 40.400,356.730 40.400 C 356.311 40.400,355.262 40.760,354.400 41.200 C 353.538 41.640,352.397 42.000,351.866 42.000 C 351.335 42.000,350.113 42.285,349.150 42.633 C 347.494 43.233,339.683 44.760,334.000 45.595 C 332.570 45.805,330.140 46.161,328.600 46.385 C 324.783 46.941,320.393 48.165,320.013 48.779 C 319.816 49.097,318.499 49.338,316.453 49.429 C 314.052 49.536,312.627 49.839,310.987 50.589 C 309.766 51.147,307.920 51.791,306.884 52.021 C 305.101 52.415,303.472 53.058,299.800 54.816 C 298.089 55.635,293.229 57.387,290.600 58.133 C 289.720 58.382,288.910 58.680,288.800 58.795 C 287.788 59.854,285.454 61.200,284.630 61.200 C 284.040 61.200,283.395 61.539,283.107 62.000 C 282.738 62.591,282.174 62.800,280.950 62.800 C 279.630 62.800,279.251 62.962,279.084 63.600 C 278.959 64.079,278.538 64.400,278.037 64.400 C 277.554 64.400,277.200 64.658,277.200 65.010 C 277.200 65.345,276.745 65.793,276.190 66.004 C 275.634 66.215,275.082 66.641,274.964 66.950 C 274.839 67.277,274.424 67.427,273.974 67.309 C 273.455 67.173,273.200 67.311,273.200 67.726 C 273.200 68.067,272.824 68.466,272.363 68.612 C 271.786 68.795,271.589 69.113,271.726 69.639 C 271.880 70.226,271.712 70.400,270.996 70.400 C 270.485 70.400,270.007 70.541,269.933 70.714 C 269.767 71.105,265.033 75.455,263.323 76.788 C 262.321 77.570,262.099 77.993,262.262 78.811 C 262.485 79.927,261.495 81.201,261.012 80.419 C 260.628 79.799,260.000 79.911,260.000 80.600 C 260.000 80.930,260.193 81.200,260.428 81.200 C 260.985 81.200,260.737 82.892,260.151 83.085 C 259.904 83.166,259.601 82.846,259.477 82.374 C 259.353 81.898,259.019 81.594,258.726 81.691 C 257.849 81.983,257.925 82.976,258.857 83.401 C 260.648 84.216,260.711 85.059,259.091 86.542 C 257.794 87.731,257.600 88.141,257.600 89.705 C 257.600 90.814,257.370 91.693,257.000 92.000 C 256.670 92.274,256.400 92.732,256.400 93.018 C 256.400 93.304,255.948 94.076,255.395 94.733 C 253.559 96.915,253.107 98.927,253.397 103.627 C 253.615 107.151,253.556 107.938,253.048 108.361 C 252.037 109.200,250.104 107.837,250.310 106.430 C 250.421 105.673,250.141 104.954,249.385 104.055 C 248.266 102.725,248.272 102.794,248.883 98.600 C 249.066 97.349,247.938 97.641,247.110 99.059 C 246.449 100.189,246.437 100.380,246.987 100.930 C 247.819 101.762,247.758 102.651,246.757 104.270 C 246.269 105.059,245.990 106.036,246.095 106.587 C 246.222 107.248,246.070 107.593,245.598 107.716 C 245.160 107.831,244.826 108.480,244.655 109.547 C 244.509 110.456,244.213 111.200,243.995 111.200 C 243.778 111.200,243.600 111.470,243.600 111.800 C 243.600 112.130,243.786 112.400,244.013 112.400 C 244.241 112.400,244.799 113.030,245.253 113.800 C 245.888 114.876,246.341 115.200,247.212 115.200 C 248.046 115.200,248.983 115.808,250.755 117.500 C 252.080 118.765,254.404 120.848,255.919 122.130 C 258.243 124.096,258.777 124.791,259.343 126.587 C 259.712 127.756,260.280 128.935,260.607 129.206 C 260.933 129.476,261.200 130.090,261.200 130.569 C 261.200 131.048,261.373 131.613,261.584 131.824 C 262.350 132.590,262.371 135.129,261.619 136.087 C 261.224 136.589,260.796 137.720,260.666 138.600 C 259.959 143.411,259.567 144.904,258.195 148.000 C 256.718 151.332,256.682 151.532,256.384 158.000 C 256.185 162.335,255.848 165.329,255.403 166.724 C 254.311 170.147,254.689 170.800,257.759 170.800 C 260.263 170.800,260.311 170.780,260.788 169.500 C 261.055 168.785,261.429 167.804,261.619 167.320 C 261.834 166.772,262.536 166.281,263.482 166.018 C 265.474 165.464,267.697 161.406,267.107 159.400 C 266.276 156.575,266.278 140.600,267.110 138.979 C 267.788 137.657,267.823 137.271,267.394 135.836 C 267.124 134.936,266.990 133.622,267.095 132.915 L 267.286 131.631 268.743 133.015 C 269.544 133.776,270.548 134.511,270.972 134.649 C 273.420 135.443,277.075 139.224,279.046 143.000 C 279.620 144.100,280.335 145.279,280.634 145.620 C 282.415 147.646,282.929 152.000,281.387 152.000 C 280.772 152.000,280.290 152.275,280.158 152.700 C 280.039 153.085,279.802 153.670,279.630 154.000 C 279.438 154.371,279.750 155.516,280.447 157.000 C 282.036 160.381,282.236 161.747,281.408 163.581 C 281.029 164.423,280.821 165.447,280.947 165.856 C 281.230 166.778,279.990 168.477,278.959 168.578 C 276.087 168.861,275.615 169.492,275.605 173.054 C 275.602 174.184,275.345 175.984,275.033 177.054 C 273.900 180.942,273.600 182.318,273.600 183.635 C 273.600 187.065,272.764 189.005,270.967 189.748 C 270.013 190.143,269.193 190.783,269.078 191.223 C 268.961 191.671,268.531 192.000,268.061 192.000 C 267.613 192.000,267.134 192.183,266.996 192.406 C 266.859 192.629,266.061 193.161,265.223 193.588 C 264.386 194.015,263.014 195.090,262.174 195.976 C 261.100 197.110,260.012 197.772,258.508 198.210 C 256.305 198.850,254.800 199.970,254.800 200.969 C 254.800 201.282,254.305 202.048,253.700 202.671 C 252.015 204.405,249.710 208.055,249.419 209.450 C 249.276 210.137,248.727 211.105,248.199 211.601 L 247.239 212.503 248.119 213.252 L 249.000 214.001 247.100 215.642 C 245.679 216.870,245.200 217.565,245.200 218.400 C 245.200 219.199,244.773 219.877,243.700 220.783 C 241.342 222.773,240.000 224.105,240.000 224.456 C 240.000 224.634,239.498 225.039,238.883 225.357 C 238.060 225.783,237.586 226.509,237.077 228.124 C 236.697 229.328,236.095 230.555,235.739 230.851 C 234.909 231.539,233.600 234.580,233.600 235.819 C 233.600 237.548,231.241 238.021,231.206 236.300 C 231.203 236.135,230.949 236.000,230.643 236.000 C 230.336 236.000,229.982 235.730,229.855 235.400 C 229.266 233.863,226.505 235.800,226.154 237.997 C 225.971 239.143,225.515 239.855,224.387 240.762 C 223.465 241.503,222.759 242.476,222.592 243.235 C 221.971 246.064,218.808 250.000,217.155 250.000 C 214.953 250.000,213.789 250.577,213.219 251.953 C 212.941 252.624,212.373 253.282,211.957 253.414 C 210.337 253.928,210.240 257.200,211.844 257.200 C 212.128 257.200,212.504 257.434,212.680 257.720 C 212.856 258.006,213.860 258.737,214.912 259.344 C 215.964 259.951,217.224 261.066,217.712 261.822 C 218.200 262.578,218.915 263.299,219.300 263.425 C 220.158 263.706,220.210 264.344,219.400 264.655 C 219.070 264.782,218.800 265.049,218.800 265.248 C 218.800 265.625,214.573 269.723,213.171 270.705 C 210.513 272.567,204.406 268.859,205.228 265.883 C 205.774 263.907,205.033 262.251,203.526 262.076 C 202.939 262.008,202.243 261.693,201.980 261.376 C 201.717 261.059,200.989 260.800,200.361 260.800 C 199.501 260.800,199.070 260.508,198.606 259.612 C 197.993 258.426,196.799 257.540,195.527 257.326 C 195.001 257.238,194.758 257.713,194.413 259.507 C 193.539 264.055,193.148 265.434,192.142 267.523 C 191.579 268.691,190.989 270.131,190.831 270.723 C 190.673 271.315,190.188 271.980,189.753 272.200 C 188.586 272.791,184.046 277.618,183.758 278.575 C 183.365 279.882,181.595 281.540,180.045 282.051 C 179.262 282.309,178.398 282.719,178.125 282.960 C 176.882 284.059,176.508 284.286,175.536 284.530 C 174.965 284.673,174.202 285.243,173.840 285.795 C 173.308 286.608,172.856 286.800,171.481 286.800 C 170.398 286.800,168.911 287.232,167.390 287.987 C 166.075 288.641,164.754 289.181,164.454 289.187 C 164.153 289.194,163.073 289.460,162.054 289.778 C 153.682 292.388,142.790 292.152,136.566 289.226 C 135.600 288.772,134.657 288.400,134.473 288.400 C 134.140 288.400,129.820 284.667,128.118 282.909 C 127.633 282.407,127.125 281.323,126.990 280.499 C 126.855 279.674,126.397 278.345,125.972 277.546 C 125.548 276.746,125.200 275.474,125.200 274.719 C 125.200 273.696,124.870 273.028,123.900 272.091 C 121.789 270.051,121.200 269.247,121.200 268.400 C 121.200 267.932,120.933 267.600,120.557 267.600 C 120.184 267.600,120.001 267.375,120.120 267.064 C 120.369 266.417,120.065 265.951,119.000 265.345 C 118.132 264.851,118.010 261.152,118.829 260.166 C 119.080 259.862,119.077 259.328,118.818 258.649 C 118.141 256.867,114.800 257.348,114.800 259.228 C 114.800 259.595,113.720 260.857,112.400 262.033 C 111.080 263.209,109.901 264.483,109.779 264.865 C 109.153 266.837,105.881 265.034,104.763 262.100 C 104.066 260.271,105.534 258.254,106.757 259.361 C 107.724 260.236,107.857 260.184,108.361 258.740 C 109.140 256.507,107.649 252.348,105.816 251.639 C 105.587 251.550,104.812 250.859,104.092 250.102 C 103.373 249.346,102.293 248.594,101.692 248.432 C 100.475 248.103,100.500 248.372,101.027 241.135 C 101.271 237.786,101.248 237.654,100.340 237.177 C 99.823 236.905,98.809 236.169,98.086 235.541 C 97.363 234.914,96.353 234.400,95.840 234.400 C 94.882 234.400,92.882 233.088,92.237 232.036 C 92.037 231.711,91.446 231.048,90.923 230.564 C 90.400 230.079,89.124 228.032,88.086 226.014 C 86.797 223.507,85.828 222.132,85.027 221.672 C 82.872 220.437,82.400 219.865,82.400 218.485 C 82.400 217.749,82.208 216.788,81.972 216.348 C 81.661 215.767,81.674 215.393,82.020 214.976 C 83.148 213.616,80.320 211.383,76.907 210.939 C 75.858 210.802,73.947 210.175,72.659 209.545 C 71.248 208.855,69.670 208.400,68.687 208.400 C 66.981 208.400,65.298 206.996,62.452 203.200 C 61.875 202.430,60.923 201.337,60.336 200.772 C 59.105 199.585,58.574 197.812,58.189 193.600 C 58.038 191.950,57.641 189.520,57.306 188.200 C 56.835 186.345,56.765 184.847,57.000 181.600 C 57.166 179.290,57.274 176.710,57.239 175.867 C 57.202 174.960,57.490 173.816,57.945 173.067 C 58.368 172.370,58.845 171.170,59.006 170.400 C 59.167 169.630,59.726 168.191,60.249 167.203 C 60.772 166.215,61.202 165.045,61.204 164.603 C 61.207 164.161,61.952 163.022,62.861 162.072 C 64.051 160.827,64.608 159.838,64.851 158.537 C 65.238 156.469,67.900 150.339,69.672 147.436 C 70.331 146.356,70.970 144.826,71.092 144.036 C 71.334 142.461,72.168 140.575,73.085 139.528 C 73.530 139.020,73.706 137.454,73.805 133.128 C 73.962 126.262,74.185 123.950,74.799 122.802 C 75.067 122.301,75.154 121.311,75.007 120.439 C 74.821 119.341,74.918 118.800,75.366 118.428 C 75.909 117.977,75.912 117.790,75.390 116.781 C 74.969 115.967,74.830 114.578,74.901 111.912 C 75.022 107.370,74.187 104.923,72.449 104.722 C 71.820 104.649,71.242 104.240,71.005 103.700 C 70.685 102.969,70.290 102.800,68.905 102.800 C 66.907 102.800,66.813 102.955,68.300 103.797 C 69.987 104.753,63.534 104.455,61.634 103.489 C 60.415 102.870,60.196 102.860,59.603 103.398 C 59.201 103.761,58.162 104.000,56.988 104.000 C 55.398 104.000,54.813 104.210,53.819 105.138 C 53.019 105.885,51.801 106.446,50.274 106.772 C 48.995 107.045,47.852 107.520,47.735 107.826 C 47.429 108.622,45.068 110.000,44.010 110.000 C 43.358 110.000,43.180 110.172,43.357 110.633 C 43.491 110.981,43.600 111.841,43.600 112.544 C 43.600 113.392,43.985 114.244,44.745 115.076 C 45.516 115.919,45.778 116.505,45.546 116.865 C 45.357 117.159,45.303 117.886,45.428 118.479 C 45.647 119.524,45.608 119.551,44.211 119.324 C 42.594 119.062,41.636 119.868,41.613 121.510 C 41.603 122.202,41.305 122.479,40.366 122.667 C 39.484 122.843,38.952 123.293,38.497 124.247 C 37.975 125.342,37.695 125.539,36.931 125.347 C 35.857 125.077,35.511 128.138,36.500 129.153 C 37.110 129.779,35.214 131.536,32.400 132.952 C 30.753 133.781,30.611 133.969,30.734 135.165 C 30.807 135.883,30.660 136.972,30.407 137.584 C 30.040 138.469,30.070 138.993,30.554 140.151 C 31.115 141.495,31.106 141.658,30.435 142.302 C 29.262 143.429,28.923 144.403,28.454 148.000 C 28.210 149.870,27.912 152.030,27.791 152.800 C 27.670 153.570,27.310 155.988,26.990 158.174 C 26.554 161.155,26.141 162.552,25.338 163.765 C 24.356 165.249,23.421 168.502,22.970 172.000 C 22.279 177.363,21.852 179.046,20.949 179.955 C 20.427 180.480,20.000 181.132,20.000 181.405 C 20.000 182.270,18.060 186.326,17.481 186.670 C 16.431 187.293,15.491 192.013,15.732 195.446 C 16.461 205.832,16.804 209.646,17.191 211.657 C 17.473 213.128,17.499 214.714,17.264 216.212 C 16.834 218.956,17.021 219.889,18.068 220.221 C 18.944 220.499,19.433 221.487,19.793 223.700 C 19.973 224.813,20.230 225.200,20.785 225.200 C 22.102 225.200,22.800 225.662,22.813 226.543 C 22.820 227.014,23.090 227.749,23.413 228.176 C 23.736 228.604,24.000 229.639,24.000 230.476 C 24.000 232.195,24.736 232.481,26.315 231.374 C 28.346 229.952,29.907 232.313,29.395 236.034 C 29.076 238.352,29.540 239.770,31.432 242.261 C 32.126 243.175,32.814 244.400,32.960 244.984 C 33.163 245.792,33.439 246.016,34.113 245.923 C 34.827 245.824,35.004 246.001,35.020 246.831 C 35.031 247.398,35.436 248.287,35.920 248.806 C 36.404 249.326,36.800 250.071,36.800 250.463 C 36.800 250.855,37.259 252.576,37.821 254.288 C 38.382 255.999,38.877 258.480,38.921 259.800 C 38.997 262.119,39.035 262.197,40.026 262.096 C 40.970 262.001,41.083 262.160,41.426 264.082 C 41.788 266.106,41.852 266.184,43.465 266.586 C 45.424 267.073,46.637 268.080,47.543 269.970 C 47.928 270.773,48.862 271.706,49.800 272.225 C 51.133 272.963,51.479 273.423,51.877 274.987 C 52.329 276.769,53.664 278.944,55.269 280.516 C 56.054 281.284,56.229 282.000,55.633 282.000 C 54.733 282.000,53.911 281.417,53.579 280.545 C 53.201 279.552,51.491 279.205,50.987 280.021 C 50.719 280.454,52.546 282.400,53.221 282.400 C 53.429 282.400,53.600 282.674,53.600 283.009 C 53.600 283.343,54.050 283.822,54.600 284.073 C 55.150 284.323,55.600 284.680,55.600 284.864 C 55.600 285.049,55.984 285.200,56.453 285.200 C 56.922 285.200,57.920 285.852,58.671 286.648 C 59.922 287.974,60.171 288.075,61.628 287.842 C 63.157 287.597,63.209 287.625,62.975 288.556 C 62.710 289.612,62.909 289.730,65.800 290.239 C 66.680 290.394,67.774 290.764,68.232 291.062 C 69.586 291.943,72.782 292.711,76.200 292.977 C 80.075 293.279,85.864 294.230,88.635 295.020 C 89.754 295.339,91.166 295.600,91.771 295.600 C 92.376 295.600,95.240 296.162,98.136 296.849 C 105.888 298.688,106.781 298.789,119.000 299.196 C 125.160 299.401,131.820 299.769,133.800 300.013 C 138.481 300.591,149.970 300.177,151.508 299.375 C 152.109 299.061,153.427 298.804,154.437 298.802 C 155.448 298.801,157.321 298.440,158.600 298.000 C 160.460 297.360,161.967 297.200,166.130 297.200 C 168.992 297.200,172.452 297.005,173.818 296.768 C 176.136 296.364,176.484 296.409,179.051 297.442 C 181.085 298.261,182.558 298.564,184.714 298.607 C 187.041 298.653,187.846 298.838,188.714 299.528 C 190.400 300.870,192.389 301.653,194.912 301.968 C 196.626 302.181,197.382 302.481,197.835 303.128 C 198.199 303.649,198.870 304.000,199.499 304.000 C 200.078 304.000,201.823 304.619,203.376 305.376 C 209.368 308.295,213.474 308.651,215.855 306.457 C 217.208 305.211,219.051 304.670,220.374 305.131 C 221.033 305.361,222.297 305.477,223.183 305.388 C 224.646 305.243,224.852 305.341,225.427 306.453 C 225.899 307.365,226.264 307.624,226.858 307.469 C 227.297 307.354,228.259 307.616,228.996 308.051 C 229.839 308.548,231.424 308.928,233.268 309.075 L 236.200 309.308 238.861 311.854 C 240.440 313.365,241.871 314.400,242.381 314.400 C 243.931 314.400,245.445 315.518,246.431 317.389 C 247.072 318.605,247.739 319.310,248.400 319.470 C 249.828 319.813,250.364 320.332,251.261 322.240 C 252.014 323.842,252.879 324.464,255.000 324.931 C 255.743 325.095,255.738 325.111,254.935 325.154 C 253.998 325.204,254.156 326.328,255.455 328.862 C 256.105 330.128,256.161 331.453,255.581 331.812 C 255.073 332.126,255.846 333.200,256.579 333.200 C 257.835 333.200,258.800 335.028,258.800 337.404 C 258.800 339.309,259.006 340.054,259.880 341.316 L 260.961 342.875 260.119 343.538 C 259.043 344.385,259.530 346.203,260.731 345.822 C 261.326 345.633,261.565 345.917,261.973 347.294 C 262.251 348.232,262.640 349.313,262.839 349.695 C 263.985 351.899,262.531 352.967,259.473 352.169 C 256.676 351.438,256.244 351.644,256.580 353.547 C 256.722 354.346,256.934 355.726,257.052 356.614 C 257.170 357.502,257.595 358.662,257.995 359.193 L 258.723 360.159 259.380 358.586 C 259.897 357.350,260.118 357.140,260.413 357.607 C 261.012 358.554,260.869 359.202,259.777 360.500 C 258.667 361.819,258.823 362.275,260.456 362.490 C 261.790 362.665,262.652 363.381,263.889 365.341 C 264.428 366.194,265.207 366.981,265.621 367.090 C 266.538 367.329,266.772 368.043,266.717 370.437 C 266.669 372.546,266.959 373.200,267.944 373.200 C 269.099 373.200,269.645 372.388,268.954 371.697 C 268.143 370.886,268.420 369.827,269.482 369.675 C 270.194 369.573,270.434 369.833,270.778 371.075 C 271.010 371.914,271.364 372.855,271.565 373.167 C 271.805 373.539,271.721 374.055,271.321 374.664 C 270.368 376.119,270.918 377.522,272.501 377.675 C 273.557 377.777,273.822 377.992,273.919 378.825 C 273.993 379.461,274.490 380.117,275.226 380.552 C 275.880 380.938,276.318 381.409,276.201 381.599 C 276.083 381.789,276.159 382.051,276.369 382.181 C 276.579 382.311,276.924 382.107,277.137 381.727 C 277.643 380.823,278.539 381.520,279.637 383.673 C 280.066 384.513,280.614 385.200,280.855 385.200 C 281.108 385.200,281.212 385.627,281.099 386.214 C 280.860 387.466,282.101 388.346,283.026 387.579 C 283.342 387.317,283.600 387.275,283.600 387.487 C 283.600 387.698,284.016 388.061,284.524 388.292 C 285.087 388.549,285.629 389.320,285.913 390.268 C 286.169 391.123,287.024 392.448,287.812 393.211 L 289.244 394.600 337.806 394.718 L 386.368 394.835 386.234 256.918 C 386.160 181.063,386.077 118.979,386.050 118.952 C 385.594 118.513,372.089 118.725,369.763 119.208 C 368.580 119.453,367.435 119.545,367.219 119.412 C 367.003 119.278,366.066 119.536,365.138 119.984 C 364.209 120.433,363.309 120.800,363.137 120.800 C 361.878 120.800,366.538 115.880,368.500 115.138 C 369.105 114.909,369.600 114.566,369.600 114.376 C 369.600 113.783,371.231 112.479,372.313 112.207 C 372.881 112.065,373.833 111.538,374.429 111.037 C 375.255 110.342,376.615 109.954,380.171 109.396 C 382.734 108.994,385.116 108.457,385.465 108.202 C 386.435 107.493,386.612 26.609,385.644 26.864 C 385.510 26.899,384.815 27.001,384.100 27.089 M372.586 78.041 C 374.790 79.977,374.285 81.177,371.260 81.195 C 370.665 81.198,369.675 81.884,368.555 83.069 C 366.569 85.172,365.989 84.978,365.362 82.000 C 364.828 79.471,365.325 78.662,368.102 77.534 C 370.472 76.572,370.978 76.629,372.586 78.041 M256.300 84.676 C 255.342 84.926,255.415 85.600,256.400 85.600 C 256.844 85.600,257.200 85.333,257.200 85.000 C 257.200 84.670,257.155 84.421,257.100 84.446 C 257.045 84.472,256.685 84.575,256.300 84.676 M255.200 89.600 C 255.200 89.820,255.470 90.000,255.800 90.000 C 256.130 90.000,256.400 89.820,256.400 89.600 C 256.400 89.380,256.130 89.200,255.800 89.200 C 255.470 89.200,255.200 89.380,255.200 89.600 M252.400 92.200 C 252.400 92.530,252.692 92.800,253.049 92.800 C 253.580 92.800,253.608 92.691,253.200 92.200 C 252.926 91.870,252.634 91.600,252.551 91.600 C 252.468 91.600,252.400 91.870,252.400 92.200 M127.366 95.723 C 124.710 97.209,126.676 104.000,129.762 104.000 C 131.355 104.000,132.424 101.357,131.150 100.569 C 130.858 100.389,130.769 99.424,130.896 97.836 L 131.093 95.382 129.534 95.382 C 128.677 95.382,127.701 95.535,127.366 95.723 M146.630 99.951 C 146.511 100.144,145.593 100.508,144.591 100.761 C 142.825 101.205,142.787 101.246,143.376 102.087 C 143.917 102.859,143.918 103.028,143.383 103.619 C 142.884 104.171,142.844 104.840,143.151 107.581 C 143.612 111.703,143.786 111.894,146.553 111.314 C 148.021 111.006,149.250 110.986,150.435 111.252 C 155.678 112.430,159.198 108.850,155.599 105.999 C 154.718 105.302,153.887 104.290,153.752 103.751 C 153.596 103.130,152.998 102.559,152.117 102.191 C 151.353 101.872,150.637 101.265,150.527 100.842 C 150.248 99.774,147.174 99.071,146.630 99.951 M243.600 104.400 C 243.600 105.147,243.707 105.253,244.080 104.880 C 244.453 104.507,244.453 104.293,244.080 103.920 C 243.707 103.547,243.600 103.653,243.600 104.400 M242.278 107.056 C 241.771 107.563,242.389 107.863,243.578 107.689 C 244.246 107.591,244.693 107.351,244.572 107.155 C 244.320 106.747,242.659 106.675,242.278 107.056 M240.656 108.678 C 240.275 109.059,240.347 110.000,240.757 110.000 C 241.248 110.000,241.642 108.873,241.238 108.624 C 241.059 108.513,240.796 108.537,240.656 108.678 M145.600 114.400 C 145.600 114.840,145.780 115.200,146.000 115.200 C 146.220 115.200,146.400 114.840,146.400 114.400 C 146.400 113.960,146.220 113.600,146.000 113.600 C 145.780 113.600,145.600 113.960,145.600 114.400 M192.713 116.700 C 192.378 117.085,191.900 117.793,191.651 118.274 C 191.049 119.440,191.034 131.050,191.635 131.422 C 192.377 131.880,192.763 131.084,193.161 128.274 C 193.389 126.664,193.965 124.848,194.580 123.799 C 197.290 119.174,195.730 113.242,192.713 116.700 M361.476 121.821 C 361.552 122.053,360.711 122.532,359.607 122.885 C 357.742 123.481,357.600 123.479,357.600 122.858 C 357.600 121.623,361.104 120.686,361.476 121.821 M354.571 123.829 C 354.917 124.174,355.200 124.285,355.200 124.075 C 355.200 123.651,356.638 123.171,356.956 123.489 C 357.198 123.732,354.494 125.588,350.400 127.989 C 348.750 128.957,346.884 130.255,346.253 130.874 C 345.621 131.493,344.974 132.000,344.815 132.000 C 344.655 132.000,344.001 132.461,343.362 133.023 C 342.723 133.586,341.704 134.311,341.098 134.635 C 340.492 134.958,339.570 135.897,339.050 136.720 C 338.531 137.544,337.452 138.569,336.653 139.000 C 334.352 140.239,334.722 140.679,338.514 141.217 C 339.881 141.411,342.128 142.117,343.506 142.785 C 344.885 143.453,346.280 144.000,346.606 144.000 C 347.508 144.000,347.335 144.450,345.758 146.200 C 344.965 147.080,344.044 148.205,343.712 148.700 C 343.380 149.195,342.885 149.600,342.612 149.600 C 341.809 149.600,336.400 155.628,336.400 156.523 C 336.400 156.709,335.686 158.083,334.813 159.577 C 333.940 161.072,333.109 163.030,332.965 163.929 C 332.656 165.860,331.586 166.994,330.372 166.677 C 329.737 166.511,329.146 166.849,328.059 168.001 C 325.654 170.551,324.157 170.317,320.447 166.811 C 318.782 165.238,315.698 163.261,311.625 161.156 C 309.549 160.083,307.749 159.064,307.625 158.891 C 307.501 158.719,306.983 158.399,306.473 158.181 C 305.202 157.637,309.816 153.742,311.981 153.532 C 312.728 153.459,313.402 153.205,313.480 152.966 C 313.626 152.522,309.461 153.108,308.600 153.653 C 308.380 153.792,307.570 154.026,306.800 154.172 C 306.030 154.318,304.590 154.769,303.600 155.174 C 298.436 157.286,296.102 157.552,291.283 156.575 C 287.019 155.710,286.621 155.062,289.297 153.338 C 290.439 152.602,291.654 152.000,291.998 152.000 C 292.341 152.000,292.977 151.754,293.411 151.454 C 293.845 151.154,294.650 150.772,295.200 150.605 C 295.750 150.439,299.290 148.794,303.066 146.951 C 306.842 145.108,310.051 143.600,310.196 143.600 C 310.342 143.600,311.467 142.880,312.696 142.000 C 313.925 141.120,315.145 140.400,315.408 140.400 C 315.670 140.400,316.676 139.796,317.642 139.058 C 318.609 138.321,319.789 137.594,320.264 137.443 C 320.740 137.292,321.411 136.737,321.757 136.209 C 322.103 135.681,323.334 134.774,324.493 134.193 C 325.652 133.612,326.870 132.896,327.200 132.601 C 329.519 130.528,340.377 125.604,342.656 125.591 C 343.505 125.586,344.985 125.226,345.944 124.791 C 346.903 124.356,348.163 123.987,348.744 123.972 C 349.325 123.956,350.160 123.789,350.600 123.600 C 351.904 123.040,353.897 123.154,354.571 123.829 M351.383 139.181 C 352.067 139.937,352.053 139.970,350.945 140.204 C 350.315 140.336,349.077 140.627,348.194 140.848 C 347.100 141.123,346.239 141.119,345.494 140.836 C 343.914 140.235,344.150 139.600,345.954 139.600 C 346.809 139.600,348.114 139.337,348.854 139.016 C 350.584 138.265,350.551 138.262,351.383 139.181 M142.800 141.401 C 141.538 141.852,141.379 142.080,141.187 143.707 C 141.028 145.044,140.594 145.932,139.509 147.132 C 135.993 151.024,136.681 163.017,140.374 162.206 C 141.004 162.067,141.937 162.224,142.625 162.582 C 146.733 164.725,150.454 160.549,148.203 156.321 C 147.090 154.230,147.173 153.652,148.869 151.684 C 150.082 150.277,149.879 148.993,148.226 147.622 C 147.882 147.336,147.600 146.886,147.600 146.623 C 147.600 146.360,146.969 145.407,146.199 144.507 C 145.341 143.505,144.837 142.524,144.899 141.979 C 145.024 140.878,144.594 140.760,142.800 141.401 M125.986 146.513 C 123.991 148.097,122.794 152.805,124.245 153.362 C 125.435 153.819,127.547 152.110,127.812 150.476 C 127.943 149.664,128.225 148.575,128.437 148.055 C 129.114 146.399,127.449 145.351,125.986 146.513 M321.994 147.543 C 319.742 148.742,319.342 149.977,320.808 151.200 C 321.468 151.750,322.006 152.475,322.004 152.811 C 321.989 155.270,326.904 156.501,328.392 154.411 C 329.224 153.243,329.011 151.600,328.028 151.600 C 327.839 151.600,327.192 150.655,326.590 149.500 C 325.029 146.501,324.429 146.245,321.994 147.543 M327.600 153.200 C 327.600 154.543,325.394 154.997,324.442 153.851 C 323.617 152.856,324.357 152.000,326.043 152.000 C 327.506 152.000,327.600 152.072,327.600 153.200 M296.113 162.790 C 296.227 163.225,296.833 163.799,297.460 164.066 C 299.314 164.855,300.800 166.437,300.800 167.622 C 300.800 168.212,301.358 170.383,302.040 172.447 C 303.092 175.630,303.214 176.387,302.840 177.428 C 302.598 178.104,302.400 179.158,302.400 179.771 C 302.400 185.157,298.042 192.000,294.611 192.000 C 294.266 192.000,293.312 192.438,292.491 192.973 C 289.817 194.719,288.091 193.731,289.399 191.203 C 289.776 190.473,289.850 189.954,289.599 189.799 C 288.939 189.391,289.144 188.419,290.178 187.065 C 290.716 186.359,291.353 184.902,291.594 183.825 C 291.841 182.723,292.538 181.293,293.189 180.551 C 293.965 179.668,294.432 178.602,294.608 177.317 C 294.753 176.263,295.034 174.770,295.233 174.000 C 295.684 172.260,295.716 165.096,295.276 164.580 C 294.169 163.282,294.013 162.000,294.962 162.000 C 295.566 162.000,295.981 162.285,296.113 162.790 M310.381 204.228 C 315.512 205.217,314.375 212.121,308.800 213.826 C 305.218 214.921,300.256 212.536,301.623 210.376 C 301.824 210.059,301.991 209.277,301.994 208.638 C 301.998 207.802,302.462 207.037,303.650 205.907 C 306.108 203.568,306.479 203.476,310.381 204.228 M136.597 231.605 C 136.440 231.859,136.769 232.544,137.331 233.133 C 137.891 233.720,138.542 234.710,138.777 235.333 C 139.069 236.105,139.720 236.669,140.820 237.101 C 141.812 237.490,142.358 237.932,142.237 238.247 C 142.117 238.559,142.257 238.676,142.596 238.546 C 144.655 237.756,143.354 234.732,140.378 233.390 C 139.510 232.999,138.800 232.436,138.800 232.139 C 138.800 231.843,138.635 231.600,138.433 231.600 C 138.231 231.600,137.799 231.498,137.473 231.373 C 137.147 231.248,136.753 231.352,136.597 231.605 M158.710 258.223 C 157.879 259.054,158.989 259.998,160.747 259.954 C 161.766 259.928,162.303 259.828,161.941 259.732 C 161.579 259.636,161.190 259.207,161.078 258.779 C 160.886 258.044,159.269 257.664,158.710 258.223 M120.800 261.351 C 120.800 262.463,122.028 263.050,122.630 262.226 C 122.930 261.817,123.080 261.329,122.964 261.141 C 122.614 260.575,120.800 260.751,120.800 261.351 M151.200 264.325 C 151.200 264.958,153.510 266.870,153.768 266.451 C 154.380 265.462,153.537 264.000,152.357 264.000 C 151.720 264.000,151.200 264.146,151.200 264.325 M142.430 266.164 C 141.623 267.136,142.582 268.543,143.612 267.900 C 144.586 267.291,144.592 267.098,143.657 266.252 C 143.010 265.666,142.853 265.655,142.430 266.164 M113.087 267.672 C 114.359 268.727,112.471 270.041,111.129 269.034 C 110.426 268.507,109.918 267.257,110.213 266.779 C 110.443 266.407,112.232 266.963,113.087 267.672 M153.200 268.314 C 153.200 268.933,153.393 269.075,154.016 268.912 C 154.465 268.794,154.780 268.670,154.716 268.636 C 154.652 268.602,154.285 268.333,153.900 268.038 C 153.287 267.569,153.200 267.603,153.200 268.314 M203.300 272.390 C 204.659 272.872,204.671 273.216,203.386 274.744 C 202.327 276.003,201.711 276.069,199.507 275.160 L 198.413 274.708 199.607 273.594 C 200.263 272.981,200.800 272.190,200.800 271.836 C 200.800 271.337,200.956 271.283,201.500 271.596 C 201.885 271.818,202.695 272.175,203.300 272.390 M122.400 272.813 C 122.400 273.039,122.130 273.329,121.800 273.455 C 120.999 273.763,119.885 273.309,120.198 272.803 C 120.526 272.273,122.400 272.281,122.400 272.813 M191.420 284.565 C 192.643 285.459,190.482 286.356,188.900 285.610 L 187.800 285.092 189.000 284.564 C 190.524 283.893,190.501 283.893,191.420 284.565 M181.987 287.225 C 181.757 287.654,181.337 287.874,180.996 287.743 C 180.671 287.618,180.504 287.355,180.626 287.158 C 180.748 286.961,180.612 286.787,180.324 286.772 C 180.036 286.756,180.160 286.601,180.600 286.427 C 181.809 285.949,182.467 286.327,181.987 287.225 M190.700 289.476 C 190.315 289.576,189.685 289.576,189.300 289.476 C 188.915 289.375,189.230 289.293,190.000 289.293 C 190.770 289.293,191.085 289.375,190.700 289.476 M216.246 312.225 C 215.922 313.069,216.841 314.748,218.745 316.789 C 220.192 318.341,220.342 318.412,220.582 317.657 C 221.491 314.793,217.283 309.521,216.246 312.225 M233.043 328.233 C 232.909 328.581,232.800 329.294,232.800 329.819 C 232.800 330.362,232.456 330.956,232.000 331.200 C 230.982 331.745,230.968 333.047,231.973 333.586 C 232.399 333.813,232.804 334.495,232.873 335.100 C 232.969 335.927,233.248 336.234,234.000 336.335 C 234.550 336.409,235.360 336.799,235.800 337.200 C 237.485 338.739,240.967 336.648,239.555 334.946 C 238.571 333.760,236.302 332.707,234.777 332.728 C 233.125 332.751,232.748 332.219,233.847 331.415 C 234.354 331.045,234.433 330.579,234.212 329.271 C 233.920 327.541,233.464 327.136,233.043 328.233 M228.800 334.538 C 228.800 335.196,229.019 335.600,229.376 335.600 C 230.331 335.600,230.430 334.951,229.591 334.191 C 228.822 333.496,228.800 333.506,228.800 334.538 M245.400 344.000 C 245.259 344.228,245.604 344.400,246.200 344.400 C 246.796 344.400,247.141 344.228,247.000 344.000 C 246.864 343.780,246.504 343.600,246.200 343.600 C 245.896 343.600,245.536 343.780,245.400 344.000 M243.502 351.000 C 243.683 351.945,244.363 352.304,244.919 351.747 C 245.297 351.370,244.452 350.000,243.841 350.000 C 243.491 350.000,243.376 350.340,243.502 351.000 M252.400 352.276 C 252.400 353.309,252.424 353.321,252.987 352.576 C 253.743 351.577,253.747 351.200,253.000 351.200 C 252.615 351.200,252.400 351.586,252.400 352.276 ");
				attr(path1, "stroke", "none");
				attr(path1, "fill", "#1e1e1e");
				attr(path1, "fill-rule", "evenodd");
				add_location(path1, file$6, 11, 5442, 5646);
				attr(path2, "id", "path2");
				attr(path2, "d", "M383.800 24.975 C 366.271 35.008,353.043 40.633,344.200 41.813 C 343.100 41.959,341.300 42.317,340.200 42.607 C 339.100 42.897,337.030 43.249,335.600 43.390 C 334.170 43.531,332.370 43.803,331.600 43.994 C 330.830 44.186,328.670 44.650,326.800 45.025 C 317.508 46.890,308.339 49.603,300.800 52.718 C 298.710 53.581,296.010 54.591,294.800 54.962 C 293.590 55.333,291.300 56.303,289.711 57.118 C 288.122 57.933,284.559 59.740,281.794 61.134 C 274.868 64.624,256.800 79.155,256.800 81.235 C 256.800 81.378,256.080 82.400,255.200 83.505 C 254.320 84.610,253.600 85.642,253.600 85.797 C 253.600 86.082,253.255 86.926,251.626 90.624 C 251.135 91.738,250.160 93.268,249.457 94.024 C 246.593 97.111,244.264 100.472,242.408 104.200 C 240.226 108.583,235.073 111.217,232.555 109.236 C 231.971 108.776,230.931 108.399,230.246 108.398 C 229.561 108.396,228.493 108.131,227.874 107.808 C 227.255 107.485,225.815 107.105,224.674 106.964 C 223.533 106.823,222.225 106.474,221.767 106.189 C 221.308 105.903,220.048 105.537,218.967 105.376 C 217.885 105.215,216.640 104.858,216.200 104.584 C 215.760 104.309,214.368 103.963,213.106 103.814 C 211.845 103.666,210.724 103.400,210.615 103.225 C 210.507 103.049,209.109 102.779,207.509 102.625 C 205.909 102.470,204.240 102.114,203.800 101.832 C 203.360 101.551,202.286 101.188,201.414 101.026 C 200.541 100.864,199.335 100.477,198.734 100.166 C 198.132 99.855,196.956 99.592,196.120 99.582 C 195.284 99.573,193.880 99.305,193.000 98.988 C 191.093 98.302,183.405 98.190,181.735 98.825 C 181.120 99.058,178.880 99.400,176.756 99.585 C 174.389 99.791,172.513 100.169,171.912 100.564 C 169.783 101.958,155.567 101.162,151.000 99.392 C 149.460 98.796,147.210 98.065,146.000 97.768 C 140.295 96.371,137.143 95.384,134.540 94.182 C 133.072 93.504,126.435 93.410,123.600 94.026 C 122.610 94.242,120.630 94.607,119.200 94.839 C 117.770 95.071,115.970 95.459,115.200 95.700 C 114.430 95.942,112.630 96.364,111.200 96.638 C 109.770 96.912,107.016 97.691,105.081 98.368 C 103.145 99.046,101.300 99.600,100.979 99.600 C 100.659 99.600,99.725 99.960,98.904 100.400 C 98.084 100.840,96.923 101.200,96.326 101.200 C 95.728 101.200,95.096 101.429,94.920 101.708 C 94.744 101.988,94.105 102.434,93.500 102.700 C 92.895 102.965,92.400 103.367,92.400 103.591 C 92.400 103.816,91.948 104.000,91.396 104.000 C 90.844 104.000,90.084 104.360,89.707 104.800 C 89.330 105.240,88.567 105.601,88.011 105.603 C 87.455 105.604,86.460 105.963,85.800 106.400 C 84.295 107.397,82.394 107.422,81.154 106.461 C 80.629 106.055,79.664 105.591,79.009 105.431 C 78.354 105.270,76.987 104.362,75.972 103.412 C 72.610 100.268,68.905 99.308,62.103 99.817 C 53.658 100.451,43.405 105.198,41.420 109.395 C 39.793 112.833,39.768 113.365,41.165 114.826 C 42.855 116.594,42.177 117.980,39.329 118.582 C 38.588 118.739,37.768 119.298,37.361 119.925 C 36.977 120.516,35.949 121.657,35.076 122.459 C 33.385 124.015,33.238 124.644,33.806 127.889 C 34.092 129.516,34.053 129.605,32.755 130.289 C 30.785 131.328,29.045 133.254,28.463 135.037 C 26.976 139.594,26.374 142.384,25.791 147.417 C 25.437 150.470,24.980 153.785,24.774 154.784 C 24.115 157.992,23.321 161.323,22.482 164.400 C 22.033 166.050,21.553 168.300,21.417 169.400 C 20.866 173.856,19.009 179.443,16.809 183.272 C 14.177 187.851,13.837 189.574,13.908 198.000 C 14.056 215.687,15.670 224.048,20.232 230.762 C 20.765 231.545,21.200 232.333,21.200 232.514 C 21.200 232.694,22.219 234.405,23.463 236.315 C 24.708 238.225,26.165 240.780,26.700 241.994 C 29.085 247.404,30.497 249.936,32.160 251.790 C 33.670 253.471,34.079 254.308,34.801 257.190 C 35.675 260.676,37.486 265.641,38.015 266.000 C 38.177 266.110,38.598 266.830,38.950 267.600 C 42.837 276.111,52.646 286.312,60.451 289.962 C 64.419 291.818,67.912 293.200,68.634 293.200 C 68.996 293.200,70.127 293.457,71.146 293.771 C 73.463 294.484,79.518 295.600,81.068 295.600 C 82.281 295.600,95.028 297.848,95.519 298.148 C 96.819 298.943,109.510 300.485,117.318 300.796 C 122.203 300.990,129.530 301.362,133.600 301.622 C 141.944 302.155,149.481 301.804,158.200 300.478 C 169.055 298.828,176.821 298.986,182.350 300.972 C 183.313 301.317,184.557 301.600,185.115 301.600 C 186.605 301.600,193.801 303.794,200.085 306.163 C 211.329 310.404,217.447 317.357,221.934 331.000 C 223.771 336.585,225.669 339.403,230.960 344.400 C 238.006 351.055,241.080 354.313,242.658 356.800 C 246.305 362.548,250.050 366.219,258.597 372.426 C 260.891 374.092,265.114 377.463,265.600 378.017 C 265.710 378.142,266.681 378.910,267.757 379.722 C 268.834 380.535,272.074 383.430,274.957 386.156 C 277.841 388.882,281.263 392.032,282.562 393.156 L 284.924 395.200 320.162 395.102 L 355.400 395.004 320.347 394.900 L 285.293 394.796 278.837 388.538 C 275.286 385.096,271.260 381.397,269.890 380.319 C 267.619 378.531,265.520 376.748,263.400 374.806 C 262.441 373.928,259.409 371.654,257.956 370.724 C 257.382 370.356,256.658 369.801,256.348 369.491 C 256.037 369.180,255.347 368.693,254.814 368.408 C 253.298 367.596,246.000 360.798,246.000 360.197 C 246.000 360.043,245.460 359.116,244.800 358.138 C 244.140 357.160,243.600 356.287,243.600 356.197 C 243.600 356.107,242.520 354.967,241.200 353.664 C 239.880 352.360,238.800 351.092,238.800 350.847 C 238.800 350.601,238.614 350.400,238.388 350.400 C 238.161 350.400,237.306 349.657,236.488 348.750 C 235.669 347.842,234.758 346.897,234.462 346.650 C 232.757 345.225,226.813 338.994,225.759 337.527 C 224.583 335.891,223.873 334.091,222.794 330.012 C 222.534 329.028,222.069 327.863,221.761 327.423 C 221.452 326.982,221.200 326.308,221.200 325.925 C 221.200 325.092,220.055 322.472,219.279 321.528 C 218.975 321.158,218.428 320.321,218.063 319.668 C 216.076 316.108,211.209 310.400,210.161 310.400 C 209.907 310.400,209.479 310.136,209.211 309.813 C 208.560 309.029,203.398 306.602,199.635 305.311 C 197.966 304.739,196.240 304.050,195.800 303.780 C 195.360 303.510,194.333 303.173,193.517 303.030 C 192.701 302.887,191.531 302.508,190.917 302.188 C 190.303 301.867,189.340 301.604,188.778 301.602 C 188.215 301.601,187.145 301.150,186.400 300.600 C 185.437 299.889,184.534 299.600,183.280 299.600 C 182.310 299.600,180.409 299.309,179.058 298.952 C 176.094 298.171,163.521 298.455,159.200 299.400 C 150.884 301.220,140.869 301.881,134.200 301.051 C 131.265 300.685,124.844 300.289,119.931 300.171 C 111.056 299.956,104.176 299.285,99.200 298.148 C 92.568 296.632,84.035 295.112,78.200 294.405 C 69.781 293.386,62.427 290.863,56.800 287.064 C 52.543 284.190,45.091 276.509,43.446 273.300 C 43.079 272.585,42.604 272.000,42.390 272.000 C 42.175 272.000,42.000 271.581,42.000 271.070 C 42.000 270.558,41.547 269.714,40.993 269.194 C 40.440 268.674,39.778 267.552,39.523 266.700 C 39.268 265.849,38.731 264.977,38.330 264.762 C 37.928 264.548,37.600 264.000,37.600 263.546 C 37.600 263.092,37.346 262.154,37.035 261.460 C 36.724 260.767,36.256 259.254,35.995 258.099 C 35.734 256.943,35.358 255.897,35.160 255.775 C 34.962 255.653,34.800 255.113,34.800 254.576 C 34.800 254.039,34.485 253.273,34.100 252.874 C 32.468 251.182,30.725 248.701,30.321 247.496 C 30.082 246.783,29.656 245.930,29.375 245.600 C 29.093 245.270,28.738 244.503,28.587 243.896 C 28.435 243.289,28.156 242.697,27.967 242.579 C 27.777 242.462,27.437 241.680,27.211 240.841 C 26.985 240.002,26.170 238.490,25.400 237.482 C 24.630 236.473,24.000 235.479,24.000 235.273 C 24.000 235.067,23.735 234.678,23.411 234.409 C 23.087 234.140,22.373 232.939,21.824 231.739 C 21.274 230.540,20.442 229.072,19.973 228.479 C 16.410 223.965,14.521 211.819,14.858 195.600 L 15.012 188.200 17.279 183.800 C 21.157 176.272,21.497 175.269,22.424 168.600 C 22.699 166.620,23.153 164.540,23.432 163.978 C 24.566 161.694,26.390 151.774,26.995 144.600 C 27.496 138.657,29.619 133.007,31.757 131.933 C 34.762 130.422,35.673 128.378,34.400 126.000 C 33.906 125.078,34.533 123.200,35.334 123.200 C 35.639 123.200,36.228 122.736,36.644 122.169 C 38.023 120.289,39.155 119.200,39.730 119.200 C 40.862 119.200,44.000 117.550,44.000 116.955 C 44.000 116.106,42.022 113.600,41.353 113.600 C 40.673 113.600,40.666 113.743,41.457 111.371 C 42.410 108.510,44.174 106.965,49.084 104.690 C 50.230 104.159,51.400 103.554,51.684 103.344 C 54.454 101.302,62.943 100.200,69.744 101.001 C 72.329 101.305,72.622 101.448,74.798 103.462 C 76.068 104.638,77.286 105.600,77.504 105.600 C 78.607 105.600,78.877 106.771,78.190 108.572 L 77.503 110.369 78.752 112.768 C 79.438 114.088,80.000 115.411,80.000 115.708 C 80.000 116.006,80.358 116.634,80.796 117.103 C 81.291 117.634,81.435 118.055,81.177 118.214 C 80.926 118.369,80.864 119.151,81.018 120.183 C 81.192 121.341,81.086 122.268,80.691 123.047 C 79.887 124.634,79.610 126.413,79.409 131.283 C 79.235 135.479,79.073 136.414,77.691 141.200 C 76.892 143.967,74.869 148.187,73.352 150.252 C 71.873 152.265,70.403 155.882,69.152 160.581 C 68.510 162.991,67.741 165.335,67.443 165.791 C 67.144 166.247,66.776 167.605,66.624 168.810 C 66.473 170.014,66.006 172.440,65.588 174.200 C 65.170 175.960,64.859 177.670,64.898 178.000 C 65.027 179.093,64.295 183.355,63.757 184.640 C 62.755 187.040,64.234 189.886,67.134 191.134 C 69.477 192.142,70.746 193.414,70.076 194.084 C 69.723 194.437,69.774 194.729,70.289 195.298 C 71.044 196.133,70.721 197.022,69.390 197.773 C 67.471 198.856,67.453 199.170,69.268 199.943 C 70.839 200.611,70.916 200.707,70.100 200.967 C 69.060 201.299,68.908 202.202,69.833 202.557 C 70.680 202.882,70.653 202.889,71.383 202.160 C 71.915 201.628,72.128 201.609,72.652 202.043 C 74.123 203.264,82.400 202.388,82.400 201.011 C 82.400 199.846,83.595 198.800,84.926 198.800 C 85.510 198.800,86.783 198.588,87.754 198.328 C 89.127 197.961,90.128 197.967,92.260 198.355 C 93.767 198.630,95.990 198.941,97.200 199.048 C 98.410 199.154,99.670 199.352,100.000 199.486 C 100.330 199.621,100.690 199.754,100.800 199.782 C 100.910 199.810,101.540 200.116,102.200 200.460 C 102.860 200.805,104.702 201.477,106.292 201.953 C 109.425 202.890,110.967 204.136,111.347 206.036 C 111.498 206.788,112.013 207.389,112.887 207.834 C 113.609 208.202,114.711 209.113,115.336 209.859 C 116.584 211.350,119.222 212.800,120.688 212.800 C 121.203 212.800,121.722 213.052,121.840 213.361 C 122.167 214.212,123.680 214.452,124.433 213.770 C 126.550 211.854,132.161 212.135,134.289 214.263 L 135.701 215.674 138.816 215.399 C 141.715 215.142,141.962 215.181,142.379 215.960 C 143.678 218.388,151.588 219.437,153.955 217.495 C 155.106 216.552,158.914 215.644,162.742 215.402 C 164.942 215.263,167.332 214.843,168.542 214.383 C 169.771 213.915,171.587 213.600,173.051 213.600 C 175.785 213.600,176.024 213.424,176.752 210.879 C 177.029 209.911,177.541 209.071,177.922 208.959 C 178.295 208.850,179.308 208.385,180.174 207.926 C 182.292 206.802,184.162 206.875,186.938 208.188 L 189.258 209.285 190.155 208.443 C 190.648 207.979,191.400 207.598,191.826 207.595 C 192.252 207.592,194.037 206.963,195.792 206.197 C 197.548 205.430,199.867 204.686,200.945 204.543 C 202.255 204.369,203.323 203.917,204.162 203.180 C 207.240 200.478,209.097 202.079,207.200 205.800 C 206.184 207.793,206.191 208.826,207.229 210.146 C 209.028 212.433,211.812 210.192,211.365 206.819 C 211.150 205.203,212.027 203.518,212.576 204.491 C 213.093 205.406,213.600 207.043,213.600 207.795 C 213.600 209.678,214.349 209.170,214.804 206.979 C 215.332 204.438,216.941 202.990,218.800 203.383 C 222.714 204.212,223.405 204.147,224.499 202.847 C 225.762 201.346,226.234 201.283,226.558 202.573 C 227.239 205.287,229.812 205.464,232.420 202.977 L 233.439 202.004 234.898 202.748 C 236.492 203.561,236.800 203.342,236.800 201.396 C 236.800 200.868,237.429 199.790,238.238 198.933 C 239.367 197.735,239.755 196.915,240.046 195.109 C 240.529 192.108,241.035 190.826,242.233 189.570 C 242.774 189.003,243.407 187.923,243.641 187.170 C 244.691 183.787,244.749 183.031,244.153 180.462 C 242.912 175.110,243.871 170.661,246.839 168.000 L 248.400 166.600 248.652 162.400 C 248.862 158.898,249.045 158.045,249.752 157.268 C 250.395 156.561,250.621 155.740,250.687 153.868 C 250.767 151.623,250.993 150.423,252.397 144.808 C 252.644 143.823,252.755 142.671,252.644 142.248 C 252.511 141.738,252.854 141.096,253.667 140.337 C 254.823 139.257,254.877 139.076,254.627 137.078 C 254.442 135.599,254.531 134.639,254.922 133.886 C 255.343 133.074,255.396 132.242,255.138 130.505 C 254.574 126.703,254.467 126.469,252.959 125.754 C 252.170 125.380,251.378 124.697,251.199 124.237 C 251.020 123.776,250.655 122.815,250.388 122.100 C 250.060 121.220,249.641 120.800,249.092 120.800 C 248.646 120.800,247.669 120.170,246.921 119.400 C 245.717 118.160,245.328 118.000,243.519 118.000 C 241.527 118.000,241.493 117.981,242.174 117.229 C 243.010 116.305,242.677 114.608,241.731 114.971 C 241.403 115.097,240.871 115.200,240.548 115.200 C 240.226 115.200,239.542 115.653,239.029 116.206 C 237.991 117.327,236.800 117.194,236.800 115.957 C 236.800 115.463,237.082 115.200,237.613 115.200 C 238.397 115.200,239.309 113.745,238.929 113.100 C 238.548 112.452,237.561 112.852,237.200 113.800 C 236.743 115.002,236.762 115.001,234.822 114.011 C 233.462 113.317,233.248 113.297,233.038 113.844 C 232.680 114.778,232.694 114.797,234.200 115.426 C 236.500 116.387,235.109 118.465,232.589 117.833 C 230.249 117.246,229.383 119.489,231.365 121.001 C 233.102 122.326,233.316 122.921,232.740 124.842 C 232.402 125.970,232.390 126.814,232.696 127.900 C 233.381 130.331,232.393 140.801,231.426 141.368 C 231.020 141.606,229.892 142.475,228.920 143.300 C 227.947 144.125,226.990 144.800,226.792 144.800 C 226.594 144.800,225.986 145.281,225.441 145.869 C 224.582 146.795,224.361 146.866,223.794 146.395 C 222.899 145.652,222.414 146.452,222.406 148.685 C 222.403 149.612,222.051 151.255,221.626 152.335 C 220.378 155.500,220.135 158.915,221.091 159.842 C 222.069 160.791,222.485 161.900,221.980 162.212 C 220.726 162.987,214.646 158.964,213.682 156.721 C 213.396 156.058,212.811 155.424,212.382 155.311 C 211.451 155.068,211.366 154.575,212.200 154.255 C 213.168 153.884,212.928 152.447,211.853 152.178 C 210.889 151.936,208.836 149.600,209.588 149.600 C 209.815 149.600,210.000 149.240,210.000 148.800 C 210.000 147.920,209.588 147.772,208.941 148.419 C 208.006 149.354,206.400 148.013,206.400 146.298 C 206.400 144.077,205.463 142.755,203.071 141.600 C 201.434 140.810,200.834 140.244,200.210 138.900 C 199.478 137.323,198.800 136.688,198.800 137.580 C 198.800 138.283,196.311 141.655,194.182 143.836 C 191.533 146.550,189.718 146.760,186.056 144.780 C 181.907 142.535,180.124 140.400,182.400 140.400 C 182.814 140.400,183.964 139.600,184.956 138.623 C 185.947 137.646,187.218 136.545,187.779 136.177 C 189.014 135.368,189.079 134.281,187.978 132.882 C 187.527 132.307,187.186 131.379,187.221 130.819 C 187.361 128.591,186.411 127.161,185.367 128.028 C 184.795 128.502,184.593 128.439,183.833 127.556 C 182.763 126.313,181.377 126.703,181.003 128.352 C 180.605 130.109,178.679 132.143,177.706 131.834 C 176.448 131.434,175.485 129.763,175.980 128.838 C 176.278 128.280,176.229 127.956,175.792 127.593 C 175.128 127.042,175.017 125.309,175.588 124.406 C 175.849 123.993,175.744 123.568,175.241 123.006 C 173.750 121.341,173.876 120.862,176.086 119.796 C 178.379 118.689,180.461 118.509,181.164 119.357 C 181.862 120.197,183.111 120.389,183.651 119.739 C 183.915 119.420,184.581 119.214,185.130 119.280 C 185.951 119.379,186.306 119.079,187.127 117.600 C 187.677 116.610,188.728 115.009,189.463 114.042 C 190.198 113.076,190.800 111.847,190.800 111.312 C 190.800 110.208,192.797 108.000,193.796 108.000 C 195.367 108.000,197.959 111.103,198.634 113.793 C 199.138 115.799,202.501 115.961,204.392 114.069 C 205.676 112.786,207.032 112.400,210.260 112.400 C 212.183 112.400,212.461 112.293,212.792 111.422 C 213.051 110.739,213.563 110.377,214.482 110.227 C 215.207 110.107,216.970 109.797,218.400 109.538 C 219.830 109.278,221.751 109.102,222.668 109.147 C 223.585 109.191,224.451 109.041,224.591 108.814 C 225.020 108.120,226.346 108.352,226.800 109.200 C 227.304 110.143,228.328 110.253,228.655 109.400 C 229.007 108.484,230.247 108.683,231.405 109.841 C 232.285 110.721,232.674 110.843,233.923 110.626 C 234.735 110.485,236.066 110.268,236.880 110.145 C 238.647 109.876,241.941 106.641,243.221 103.916 C 244.617 100.944,245.624 99.326,247.100 97.685 C 247.595 97.134,248.001 96.574,248.002 96.442 C 248.003 96.309,248.818 95.341,249.811 94.292 C 251.531 92.476,253.204 89.435,253.744 87.144 C 254.482 84.015,264.192 73.918,272.729 67.403 C 273.019 67.182,273.604 66.685,274.029 66.300 C 274.453 65.915,274.882 65.600,274.982 65.600 C 275.082 65.600,276.192 64.880,277.449 64.000 C 278.705 63.120,280.041 62.400,280.417 62.400 C 280.794 62.400,281.326 62.130,281.600 61.800 C 281.874 61.470,282.301 61.197,282.549 61.193 C 282.797 61.190,283.990 60.654,285.200 60.003 C 287.397 58.821,288.958 58.077,291.600 56.956 C 292.370 56.629,293.276 56.213,293.613 56.031 C 293.950 55.850,294.809 55.574,295.521 55.417 C 296.233 55.261,299.102 54.158,301.897 52.967 C 304.691 51.775,307.307 50.800,307.709 50.800 C 308.111 50.800,308.926 50.549,309.520 50.243 C 310.114 49.937,312.490 49.203,314.800 48.612 C 317.110 48.022,319.900 47.301,321.000 47.010 C 324.226 46.159,330.776 44.823,333.800 44.401 C 344.949 42.845,354.823 40.409,360.800 37.742 C 364.243 36.206,384.734 25.753,385.421 25.182 C 385.776 24.888,385.983 24.918,386.130 25.283 C 386.244 25.567,386.351 25.395,386.368 24.900 C 386.408 23.786,385.850 23.802,383.800 24.975 M386.592 67.400 C 386.592 89.620,386.641 98.769,386.700 87.730 C 386.759 76.692,386.759 58.512,386.700 47.330 C 386.641 36.149,386.592 45.180,386.592 67.400 M133.501 94.805 C 134.326 95.248,135.018 95.923,135.041 96.305 C 135.063 96.687,135.108 97.291,135.141 97.647 C 135.191 98.192,137.954 100.400,138.586 100.400 C 138.698 100.400,139.062 99.748,139.395 98.950 C 139.963 97.592,140.083 97.519,141.300 97.792 C 142.015 97.952,143.251 98.059,144.047 98.029 C 145.691 97.966,148.383 98.784,151.600 100.321 C 153.484 101.222,154.316 101.370,157.400 101.356 C 159.380 101.347,160.145 101.408,159.100 101.492 C 157.564 101.615,157.200 101.787,157.200 102.393 C 157.200 103.885,158.319 104.468,160.627 104.179 C 163.085 103.872,165.984 106.187,165.995 108.464 C 166.006 110.905,160.107 114.020,155.017 114.262 C 150.893 114.458,150.862 114.472,150.557 116.376 C 150.128 119.065,144.709 119.242,141.457 116.675 C 140.546 115.955,139.308 115.120,138.707 114.819 C 138.105 114.518,137.258 113.941,136.823 113.536 C 136.303 113.051,135.429 112.800,134.265 112.800 C 132.672 112.800,132.447 112.680,131.993 111.582 C 131.676 110.817,130.974 110.149,130.107 109.787 C 122.843 106.752,118.604 96.684,123.965 95.198 C 124.754 94.979,125.670 94.623,126.000 94.406 C 127.116 93.674,131.866 93.926,133.501 94.805 M385.732 109.388 C 385.475 109.668,384.035 110.122,382.532 110.398 C 378.607 111.116,374.434 112.639,372.806 113.947 C 372.033 114.568,370.796 115.389,370.057 115.771 C 367.633 117.024,369.303 117.474,377.200 117.694 C 381.050 117.801,384.695 118.089,385.300 118.335 C 386.003 118.619,386.400 118.636,386.400 118.380 C 386.400 117.539,380.380 116.442,375.400 116.376 C 373.907 116.356,373.611 116.264,374.233 116.012 C 374.691 115.827,375.516 115.140,376.066 114.486 C 376.617 113.831,377.502 113.166,378.034 113.006 C 378.565 112.847,379.428 112.446,379.951 112.116 C 380.474 111.785,381.957 111.419,383.248 111.302 C 385.621 111.087,386.576 110.516,386.333 109.459 C 386.226 108.992,386.109 108.978,385.732 109.388 M235.300 111.700 C 235.552 112.457,236.800 112.564,236.800 111.829 C 236.800 111.458,236.458 111.200,235.967 111.200 C 235.478 111.200,235.202 111.407,235.300 111.700 M210.983 117.714 C 207.020 120.071,206.220 121.485,206.594 125.468 C 206.833 128.021,206.761 128.600,206.058 129.791 L 205.247 131.166 206.060 133.883 C 207.486 138.651,207.676 140.053,207.000 140.800 C 206.362 141.505,206.566 142.000,207.494 142.000 C 207.802 142.000,208.627 142.590,209.327 143.311 C 210.027 144.032,211.050 144.911,211.600 145.264 C 212.541 145.867,212.561 145.949,211.937 146.652 C 211.142 147.550,211.713 148.302,213.111 148.199 C 214.313 148.111,214.306 148.125,214.428 145.400 C 214.537 142.976,214.439 142.071,213.327 135.211 C 212.665 131.133,212.985 128.085,214.289 126.036 C 215.548 124.058,214.075 117.184,212.400 117.217 C 212.070 117.223,211.432 117.447,210.983 117.714 M386.400 257.080 C 386.290 333.024,386.335 395.025,386.501 394.859 C 386.666 394.694,386.756 332.558,386.701 256.779 L 386.600 119.000 386.400 257.080 M341.800 127.489 C 336.724 128.736,331.494 131.227,326.083 134.978 C 324.478 136.090,322.625 137.360,321.964 137.800 C 321.303 138.240,320.033 139.185,319.143 139.900 C 318.253 140.615,317.347 141.200,317.130 141.200 C 316.913 141.200,315.805 141.809,314.668 142.554 C 313.531 143.299,310.890 144.692,308.800 145.649 C 306.710 146.606,303.650 148.155,302.000 149.091 C 300.350 150.028,298.804 150.795,298.564 150.797 C 298.324 150.799,297.019 151.354,295.664 152.031 C 290.142 154.790,294.621 156.291,301.972 154.145 C 313.422 150.801,314.736 150.350,316.714 149.080 C 317.751 148.414,319.531 147.268,320.668 146.534 C 321.806 145.800,323.066 145.083,323.468 144.940 C 323.871 144.798,324.740 144.286,325.400 143.802 C 326.060 143.317,327.288 142.696,328.128 142.420 C 328.968 142.145,329.744 141.691,329.851 141.411 C 329.959 141.131,330.891 140.418,331.923 139.827 C 335.389 137.842,336.600 136.933,341.245 132.830 C 342.259 131.933,343.292 131.200,343.540 131.200 C 344.144 131.200,346.092 128.072,345.791 127.585 C 345.548 127.192,343.238 127.136,341.800 127.489 M136.696 130.400 C 137.948 130.840,139.231 131.200,139.547 131.200 C 139.864 131.200,141.310 131.773,142.761 132.474 C 145.279 133.689,145.632 133.750,150.476 133.790 C 156.064 133.837,156.889 134.146,157.332 136.361 C 157.737 138.387,157.253 139.189,155.311 139.708 C 151.558 140.712,149.760 144.239,152.698 144.835 C 153.411 144.980,154.245 145.306,154.551 145.559 C 154.981 145.916,155.160 145.882,155.342 145.407 C 156.726 141.800,162.433 147.492,162.387 152.434 L 162.375 153.800 161.554 152.700 C 160.062 150.700,158.334 151.740,158.693 154.421 C 158.802 155.226,158.594 156.946,158.231 158.243 C 156.797 163.376,155.623 164.773,154.131 163.124 C 153.424 162.342,153.409 162.345,152.571 163.395 C 151.911 164.223,151.312 164.484,149.844 164.583 C 148.810 164.652,147.642 165.000,147.250 165.355 C 146.808 165.755,145.826 166.000,144.669 166.000 C 142.545 166.000,142.375 166.376,143.801 167.914 C 144.352 168.508,144.991 169.566,145.221 170.264 C 145.686 171.673,147.152 172.809,148.989 173.185 C 150.202 173.433,150.972 174.800,149.899 174.800 C 149.591 174.800,148.917 175.250,148.400 175.800 C 147.398 176.866,147.335 177.529,147.817 181.866 L 148.091 184.332 146.746 185.014 C 144.699 186.052,144.000 186.817,144.000 188.019 C 144.000 189.681,139.652 190.154,139.039 188.559 C 138.815 187.975,137.711 187.829,136.635 188.242 C 136.288 188.375,136.087 188.618,136.189 188.782 C 136.290 188.945,135.899 189.332,135.321 189.640 C 134.498 190.078,134.233 190.091,134.101 189.700 C 134.009 189.425,133.657 189.200,133.320 189.200 C 132.873 189.200,132.761 188.914,132.908 188.145 C 133.125 187.010,131.747 182.400,131.190 182.400 C 130.814 182.400,130.596 183.060,130.200 185.388 C 129.817 187.646,129.283 186.506,128.455 181.663 C 127.847 178.109,127.707 177.766,126.661 177.265 C 125.304 176.615,124.541 174.938,123.772 170.917 C 123.460 169.289,123.025 167.620,122.804 167.208 C 122.583 166.795,122.500 166.205,122.619 165.895 C 122.738 165.585,122.224 164.424,121.477 163.315 C 119.284 160.056,118.614 155.977,119.766 152.908 C 120.485 150.994,120.912 148.287,120.843 146.076 C 120.812 145.100,121.052 143.975,121.394 143.487 C 121.727 143.011,122.000 142.266,122.000 141.830 C 122.000 141.394,122.546 140.475,123.214 139.786 C 124.095 138.877,124.519 137.949,124.765 136.397 C 125.149 133.970,125.735 133.377,128.137 132.989 C 129.214 132.815,130.294 132.258,131.200 131.409 C 132.482 130.207,133.288 129.715,134.110 129.632 C 134.280 129.614,135.444 129.960,136.696 130.400 M337.700 132.682 C 337.205 132.778,336.800 133.105,336.800 133.411 C 336.800 134.459,331.454 138.352,328.890 139.171 C 325.363 140.298,324.000 141.092,324.000 142.020 C 324.000 142.989,322.584 143.600,320.341 143.600 C 318.664 143.600,318.277 142.717,319.850 142.483 C 320.288 142.418,320.830 141.856,321.071 141.217 C 321.382 140.393,322.138 139.769,323.749 139.007 C 324.984 138.423,326.465 137.552,327.041 137.072 C 327.616 136.593,328.742 135.655,329.544 134.989 C 330.903 133.859,332.168 133.132,333.600 132.661 C 333.930 132.552,335.190 132.473,336.400 132.486 C 337.610 132.499,338.195 132.587,337.700 132.682 M318.400 144.781 C 318.400 145.590,318.080 146.189,317.386 146.681 C 316.829 147.077,315.724 147.895,314.931 148.500 C 314.139 149.105,313.087 149.600,312.594 149.600 C 312.101 149.600,311.077 149.860,310.318 150.177 C 308.166 151.076,305.185 150.517,305.639 149.300 C 305.823 148.805,306.205 148.400,306.487 148.400 C 306.769 148.400,308.141 147.860,309.536 147.200 C 310.931 146.540,312.474 146.000,312.966 146.000 C 313.458 146.000,314.274 145.560,314.780 145.021 C 315.604 144.144,316.331 143.825,317.900 143.654 C 318.199 143.622,318.400 144.074,318.400 144.781 M315.847 153.543 C 315.518 153.905,314.395 154.650,313.351 155.200 C 311.657 156.093,310.000 157.351,310.000 157.744 C 310.000 157.824,311.215 158.657,312.700 159.596 C 315.846 161.586,317.177 162.469,321.021 165.113 C 324.466 167.483,325.013 167.707,325.607 166.992 C 326.453 165.972,323.280 158.968,320.848 156.488 C 320.261 155.890,319.425 154.938,318.990 154.373 C 317.966 153.042,316.626 152.689,315.847 153.543 M130.797 155.008 C 130.590 155.553,130.176 156.000,129.877 156.000 C 128.622 156.000,128.239 157.845,129.178 159.365 L 130.059 160.790 129.030 161.259 C 128.463 161.517,128.000 161.955,128.000 162.231 C 128.000 162.508,127.890 163.022,127.755 163.372 C 127.580 163.829,127.851 164.129,128.706 164.427 C 129.653 164.757,129.951 165.142,130.134 166.272 C 130.262 167.057,130.635 167.996,130.963 168.359 C 131.347 168.784,131.625 170.158,131.740 172.210 C 131.969 176.282,132.305 177.611,133.035 177.331 C 133.441 177.175,133.530 176.705,133.357 175.622 C 133.183 174.534,133.347 173.680,133.959 172.480 C 134.967 170.504,135.021 169.293,134.155 168.058 C 133.630 167.307,133.560 166.533,133.776 163.869 C 134.019 160.878,133.954 160.421,133.015 158.491 C 132.368 157.160,132.076 156.036,132.224 155.445 C 132.569 154.072,131.301 153.683,130.797 155.008 M124.910 205.937 C 125.655 206.231,126.800 208.107,126.800 209.032 C 126.800 210.649,122.874 210.701,122.096 209.094 C 120.881 206.586,122.359 204.929,124.910 205.937 M306.941 206.217 C 304.197 207.420,303.012 210.862,304.889 212.177 C 305.866 212.862,307.821 213.012,308.181 212.431 C 308.306 212.228,308.945 211.944,309.600 211.800 C 312.157 211.238,313.169 208.333,311.418 206.582 C 310.315 205.479,308.891 205.363,306.941 206.217 M310.036 208.643 C 310.490 209.190,310.455 209.370,309.808 209.843 C 308.518 210.787,307.732 210.275,308.201 208.796 C 308.506 207.835,309.309 207.768,310.036 208.643 M161.302 252.841 C 159.281 253.841,159.363 254.099,161.969 254.952 C 164.734 255.856,165.537 255.791,165.826 254.637 C 166.451 252.147,164.372 251.322,161.302 252.841 M185.600 252.311 C 184.306 252.728,183.600 253.746,183.600 255.195 C 183.600 257.036,183.294 257.354,182.206 256.641 C 179.533 254.889,178.706 255.087,176.573 257.983 C 175.488 259.456,174.026 261.098,173.326 261.631 C 171.987 262.648,171.200 263.952,171.200 265.151 C 171.200 266.258,169.506 266.985,168.083 266.489 C 166.548 265.954,161.036 266.553,159.751 267.395 C 158.614 268.140,158.491 269.828,159.430 271.806 C 161.545 276.263,157.255 276.919,153.112 272.773 C 150.428 270.086,148.800 268.693,148.800 269.083 C 148.800 269.301,148.035 269.813,147.100 270.221 C 146.165 270.630,144.971 271.287,144.446 271.682 C 143.921 272.077,143.151 272.400,142.734 272.400 C 139.727 272.400,142.797 276.247,146.400 276.994 C 147.170 277.154,148.658 277.806,149.706 278.442 C 150.754 279.079,151.924 279.601,152.306 279.603 C 152.688 279.604,153.540 279.963,154.200 280.400 C 157.681 282.705,173.144 278.949,173.834 275.630 C 173.952 275.063,174.118 274.256,174.204 273.835 C 174.289 273.415,174.173 272.723,173.945 272.298 C 173.118 270.753,174.583 268.681,175.889 269.549 C 176.833 270.176,176.435 274.656,175.393 275.130 C 174.548 275.516,174.400 275.853,174.400 277.401 C 174.400 278.953,174.259 279.273,173.439 279.585 C 172.304 280.017,171.771 280.740,172.255 281.193 C 172.822 281.724,174.400 280.889,174.400 280.057 C 174.400 279.487,174.784 279.217,175.886 279.010 C 178.079 278.599,179.575 277.701,180.099 276.481 C 180.721 275.035,182.872 271.882,183.517 271.471 C 183.801 271.289,184.611 270.488,185.317 269.689 C 186.023 268.890,187.320 267.486,188.200 266.568 C 192.459 262.125,190.387 250.769,185.600 252.311 M141.800 253.613 C 138.764 253.862,136.992 254.718,136.579 256.136 C 136.129 257.683,134.318 262.189,133.977 262.614 C 133.794 262.842,133.255 264.462,132.779 266.214 C 132.303 267.966,131.663 269.684,131.357 270.031 C 131.051 270.379,130.806 271.189,130.813 271.831 C 130.825 272.955,130.848 272.969,131.410 272.200 C 132.778 270.328,133.425 269.636,133.825 269.618 C 134.316 269.597,135.585 267.963,136.533 266.130 C 137.425 264.404,139.965 262.071,141.263 261.786 C 141.943 261.637,142.411 261.210,142.565 260.598 C 142.697 260.072,143.344 259.324,144.002 258.935 C 145.222 258.214,145.398 257.625,144.818 256.200 C 144.588 255.633,144.718 255.153,145.267 254.552 C 146.276 253.448,145.703 253.292,141.800 253.613 M130.404 274.988 C 129.994 276.230,130.003 276.555,130.453 276.834 C 131.147 277.265,131.801 275.087,131.265 274.130 C 130.972 273.606,130.805 273.772,130.404 274.988 M161.000 284.616 C 159.572 284.943,156.152 285.175,152.555 285.190 C 147.345 285.212,146.426 285.311,145.899 285.908 C 144.496 287.499,146.569 289.407,149.343 289.076 C 150.254 288.967,152.819 288.690,155.043 288.461 C 160.268 287.922,165.068 285.805,164.211 284.418 C 163.908 283.927,164.053 283.918,161.000 284.616 ");
				attr(path2, "stroke", "none");
				attr(path2, "fill", "#816a5b");
				attr(path2, "fill-rule", "evenodd");
				add_location(path2, file$6, 11, 35456, 35660);
				attr(path3, "id", "path3");
				attr(path3, "d", "M385.378 25.182 C 384.998 25.561,379.891 28.212,368.400 33.996 C 355.979 40.249,349.424 42.220,333.800 44.401 C 330.776 44.823,324.226 46.159,321.000 47.010 C 319.900 47.301,317.110 48.022,314.800 48.612 C 312.490 49.203,310.114 49.937,309.520 50.243 C 308.926 50.549,308.111 50.800,307.709 50.800 C 307.307 50.800,304.691 51.775,301.897 52.967 C 299.102 54.158,296.233 55.261,295.521 55.417 C 294.809 55.574,293.950 55.850,293.613 56.031 C 293.276 56.213,292.370 56.629,291.600 56.956 C 288.669 58.200,287.345 58.831,285.670 59.783 C 284.719 60.323,283.549 60.884,283.070 61.030 C 282.592 61.175,281.930 61.525,281.600 61.806 C 281.270 62.087,280.640 62.405,280.200 62.512 C 279.760 62.619,280.122 62.728,281.004 62.754 C 282.207 62.788,282.732 62.600,283.107 62.000 C 283.395 61.539,284.040 61.200,284.630 61.200 C 285.454 61.200,287.788 59.854,288.800 58.795 C 288.910 58.680,289.720 58.382,290.600 58.133 C 293.229 57.387,298.089 55.635,299.800 54.816 C 303.472 53.058,305.101 52.415,306.884 52.021 C 307.920 51.791,309.766 51.147,310.987 50.589 C 312.627 49.839,314.052 49.536,316.453 49.429 C 318.499 49.338,319.816 49.097,320.013 48.779 C 320.393 48.165,324.783 46.941,328.600 46.385 C 330.140 46.161,332.570 45.805,334.000 45.595 C 339.683 44.760,347.494 43.233,349.150 42.633 C 350.113 42.285,351.335 42.000,351.866 42.000 C 352.397 42.000,353.538 41.640,354.400 41.200 C 355.262 40.760,356.311 40.400,356.730 40.400 C 357.421 40.400,359.824 39.320,365.371 36.515 C 368.501 34.932,368.549 34.909,369.600 34.446 C 370.150 34.204,370.870 33.840,371.200 33.638 C 371.530 33.436,374.264 32.072,377.277 30.606 C 380.289 29.140,382.809 27.802,382.877 27.633 C 382.944 27.463,383.667 27.219,384.482 27.090 L 385.965 26.856 386.104 29.528 L 386.243 32.200 386.316 29.000 C 386.389 25.749,386.078 24.483,385.378 25.182 M386.165 41.000 C 386.166 44.960,386.226 46.526,386.298 44.480 C 386.371 42.434,386.371 39.194,386.298 37.280 C 386.224 35.366,386.165 37.040,386.165 41.000 M277.101 64.229 C 276.061 64.983,275.118 65.600,275.005 65.600 C 274.892 65.600,274.453 65.915,274.029 66.300 C 273.604 66.685,273.019 67.182,272.729 67.403 C 264.192 73.918,254.482 84.015,253.744 87.144 C 253.204 89.435,251.531 92.476,249.811 94.292 C 248.818 95.341,248.003 96.309,248.002 96.442 C 248.001 96.574,247.595 97.134,247.100 97.685 C 245.624 99.326,244.617 100.944,243.221 103.916 C 241.941 106.641,238.647 109.876,236.880 110.145 C 236.066 110.268,234.735 110.485,233.923 110.626 C 232.674 110.843,232.285 110.721,231.405 109.841 C 230.247 108.683,229.007 108.484,228.655 109.400 C 228.328 110.253,227.304 110.143,226.800 109.200 C 226.346 108.352,225.020 108.120,224.591 108.814 C 224.451 109.041,223.585 109.191,222.668 109.147 C 221.751 109.102,219.830 109.278,218.400 109.538 C 216.970 109.797,215.207 110.107,214.482 110.227 C 213.563 110.377,213.051 110.739,212.792 111.422 C 212.461 112.293,212.183 112.400,210.260 112.400 C 207.032 112.400,205.676 112.786,204.392 114.069 C 202.501 115.961,199.138 115.799,198.634 113.793 C 197.959 111.103,195.367 108.000,193.796 108.000 C 192.797 108.000,190.800 110.208,190.800 111.312 C 190.800 111.847,190.198 113.076,189.463 114.042 C 188.728 115.009,187.677 116.610,187.127 117.600 C 186.306 119.079,185.951 119.379,185.130 119.280 C 184.581 119.214,183.915 119.420,183.651 119.739 C 183.111 120.389,181.862 120.197,181.164 119.357 C 180.461 118.509,178.379 118.689,176.086 119.796 C 173.876 120.862,173.750 121.341,175.241 123.006 C 175.744 123.568,175.849 123.993,175.588 124.406 C 175.017 125.309,175.128 127.042,175.792 127.593 C 176.229 127.956,176.278 128.280,175.980 128.838 C 175.485 129.763,176.448 131.434,177.706 131.834 C 178.679 132.143,180.605 130.109,181.003 128.352 C 181.377 126.703,182.763 126.313,183.833 127.556 C 184.593 128.439,184.795 128.502,185.367 128.028 C 186.411 127.161,187.361 128.591,187.221 130.819 C 187.186 131.379,187.527 132.307,187.978 132.882 C 189.079 134.281,189.014 135.368,187.779 136.177 C 187.218 136.545,185.947 137.646,184.956 138.623 C 183.964 139.600,182.814 140.400,182.400 140.400 C 180.124 140.400,181.907 142.535,186.056 144.780 C 189.718 146.760,191.533 146.550,194.182 143.836 C 196.311 141.655,198.800 138.283,198.800 137.580 C 198.800 136.688,199.478 137.323,200.210 138.900 C 200.834 140.244,201.434 140.810,203.071 141.600 C 205.463 142.755,206.400 144.077,206.400 146.298 C 206.400 148.013,208.006 149.354,208.941 148.419 C 209.588 147.772,210.000 147.920,210.000 148.800 C 210.000 149.240,209.815 149.600,209.588 149.600 C 208.836 149.600,210.889 151.936,211.853 152.178 C 212.928 152.447,213.168 153.884,212.200 154.255 C 211.366 154.575,211.451 155.068,212.382 155.311 C 212.811 155.424,213.396 156.058,213.682 156.721 C 214.646 158.964,220.726 162.987,221.980 162.212 C 222.485 161.900,222.069 160.791,221.091 159.842 C 220.135 158.915,220.378 155.500,221.626 152.335 C 222.051 151.255,222.403 149.612,222.406 148.685 C 222.414 146.452,222.899 145.652,223.794 146.395 C 224.361 146.866,224.582 146.795,225.441 145.869 C 225.986 145.281,226.594 144.800,226.792 144.800 C 226.990 144.800,227.947 144.125,228.920 143.300 C 229.892 142.475,231.020 141.606,231.426 141.368 C 232.393 140.801,233.381 130.331,232.696 127.900 C 232.390 126.814,232.402 125.970,232.740 124.842 C 233.316 122.921,233.102 122.326,231.365 121.001 C 229.383 119.489,230.249 117.246,232.589 117.833 C 235.141 118.473,236.492 116.383,234.156 115.408 C 233.114 114.972,232.780 114.628,232.956 114.169 C 233.090 113.820,233.200 113.456,233.200 113.359 C 233.200 113.263,233.913 113.547,234.784 113.992 C 236.766 115.003,236.742 115.005,237.200 113.800 C 237.561 112.852,238.548 112.452,238.929 113.100 C 239.309 113.745,238.397 115.200,237.613 115.200 C 237.082 115.200,236.800 115.463,236.800 115.957 C 236.800 117.194,237.991 117.327,239.029 116.206 C 239.542 115.653,240.226 115.200,240.548 115.200 C 240.871 115.200,241.403 115.097,241.731 114.971 C 242.677 114.608,243.010 116.305,242.174 117.229 C 241.493 117.981,241.527 118.000,243.519 118.000 C 245.328 118.000,245.717 118.160,246.921 119.400 C 247.669 120.170,248.646 120.800,249.092 120.800 C 249.641 120.800,250.060 121.220,250.388 122.100 C 250.655 122.815,251.020 123.776,251.199 124.237 C 251.378 124.697,252.170 125.380,252.959 125.754 C 254.467 126.469,254.574 126.703,255.138 130.505 C 255.396 132.242,255.343 133.074,254.922 133.886 C 254.531 134.639,254.442 135.599,254.627 137.078 C 254.877 139.076,254.823 139.257,253.667 140.337 C 252.854 141.096,252.511 141.738,252.644 142.248 C 252.755 142.671,252.644 143.823,252.397 144.808 C 250.993 150.423,250.767 151.623,250.687 153.868 C 250.621 155.740,250.395 156.561,249.752 157.268 C 249.045 158.045,248.862 158.898,248.652 162.400 L 248.400 166.600 246.839 168.000 C 243.871 170.661,242.912 175.110,244.153 180.462 C 244.749 183.031,244.691 183.787,243.641 187.170 C 243.407 187.923,242.774 189.003,242.233 189.570 C 241.035 190.826,240.529 192.108,240.046 195.109 C 239.755 196.915,239.367 197.735,238.238 198.933 C 237.429 199.790,236.800 200.868,236.800 201.396 C 236.800 203.342,236.492 203.561,234.898 202.748 L 233.439 202.004 232.420 202.977 C 229.812 205.464,227.239 205.287,226.558 202.573 C 226.234 201.283,225.762 201.346,224.499 202.847 C 223.405 204.147,222.714 204.212,218.800 203.383 C 216.941 202.990,215.332 204.438,214.804 206.979 C 214.349 209.170,213.600 209.678,213.600 207.795 C 213.600 207.043,213.093 205.406,212.576 204.491 C 212.027 203.518,211.150 205.203,211.365 206.819 C 211.812 210.192,209.028 212.433,207.229 210.146 C 206.191 208.826,206.184 207.793,207.200 205.800 C 209.097 202.079,207.240 200.478,204.162 203.180 C 203.323 203.917,202.255 204.369,200.945 204.543 C 199.867 204.686,197.548 205.430,195.792 206.197 C 194.037 206.963,192.252 207.592,191.826 207.595 C 191.400 207.598,190.648 207.979,190.155 208.443 L 189.258 209.285 186.938 208.188 C 184.162 206.875,182.292 206.802,180.174 207.926 C 179.308 208.385,178.295 208.850,177.922 208.959 C 177.541 209.071,177.029 209.911,176.752 210.879 C 176.024 213.424,175.785 213.600,173.051 213.600 C 171.587 213.600,169.771 213.915,168.542 214.383 C 167.332 214.843,164.942 215.263,162.742 215.402 C 158.914 215.644,155.106 216.552,153.955 217.495 C 151.588 219.437,143.678 218.388,142.379 215.960 C 141.962 215.181,141.715 215.142,138.816 215.399 L 135.701 215.674 134.289 214.263 C 132.148 212.121,126.548 211.856,124.405 213.795 C 123.663 214.467,122.429 214.240,121.880 213.330 C 121.704 213.039,121.153 212.800,120.655 212.800 C 119.219 212.800,116.573 211.337,115.336 209.859 C 114.711 209.113,113.609 208.202,112.887 207.834 C 112.013 207.389,111.498 206.788,111.347 206.036 C 110.967 204.136,109.425 202.890,106.292 201.953 C 104.702 201.477,102.860 200.805,102.200 200.460 C 101.540 200.116,100.910 199.810,100.800 199.782 C 100.690 199.754,100.330 199.621,100.000 199.486 C 99.670 199.352,98.410 199.154,97.200 199.048 C 95.990 198.941,93.767 198.630,92.260 198.355 C 90.128 197.967,89.127 197.961,87.754 198.328 C 86.783 198.588,85.479 198.800,84.856 198.800 C 83.562 198.800,82.400 199.879,82.400 201.081 C 82.400 202.394,74.067 203.217,72.652 202.043 C 72.127 201.608,71.912 201.631,71.360 202.183 C 70.995 202.548,70.435 202.746,70.116 202.623 C 69.796 202.500,69.459 202.400,69.367 202.400 C 68.756 202.400,69.370 201.200,70.100 200.967 C 70.916 200.707,70.839 200.611,69.268 199.943 C 67.453 199.170,67.471 198.856,69.390 197.773 C 70.721 197.022,71.044 196.133,70.289 195.298 C 69.774 194.729,69.723 194.437,70.076 194.084 C 70.746 193.414,69.477 192.142,67.134 191.134 C 64.234 189.886,62.755 187.040,63.757 184.640 C 64.295 183.355,65.027 179.093,64.898 178.000 C 64.859 177.670,65.170 175.960,65.588 174.200 C 66.006 172.440,66.473 170.014,66.624 168.810 C 66.776 167.605,67.144 166.247,67.443 165.791 C 67.741 165.335,68.510 162.991,69.152 160.581 C 70.403 155.882,71.873 152.265,73.352 150.252 C 74.869 148.187,76.892 143.967,77.691 141.200 C 79.073 136.414,79.235 135.479,79.409 131.283 C 79.610 126.413,79.887 124.634,80.691 123.047 C 81.086 122.268,81.192 121.341,81.018 120.183 C 80.864 119.151,80.926 118.369,81.177 118.214 C 81.435 118.055,81.291 117.634,80.796 117.103 C 80.358 116.634,80.000 116.006,80.000 115.708 C 80.000 115.411,79.438 114.088,78.752 112.768 L 77.503 110.369 78.190 108.572 C 78.877 106.771,78.607 105.600,77.504 105.600 C 77.286 105.600,76.068 104.638,74.798 103.462 C 72.622 101.448,72.329 101.305,69.744 101.001 C 62.943 100.200,54.454 101.302,51.684 103.344 C 51.400 103.554,50.230 104.159,49.084 104.690 C 44.174 106.965,42.410 108.510,41.457 111.371 C 40.666 113.743,40.673 113.600,41.353 113.600 C 42.022 113.600,44.000 116.106,44.000 116.955 C 44.000 117.550,40.862 119.200,39.730 119.200 C 39.155 119.200,38.023 120.289,36.644 122.169 C 36.228 122.736,35.639 123.200,35.334 123.200 C 34.533 123.200,33.906 125.078,34.400 126.000 C 35.673 128.378,34.762 130.422,31.757 131.933 C 29.619 133.007,27.496 138.657,26.995 144.600 C 26.390 151.774,24.566 161.694,23.432 163.978 C 23.153 164.540,22.699 166.620,22.424 168.600 C 21.497 175.269,21.157 176.272,17.279 183.800 L 15.012 188.200 14.858 195.600 C 14.521 211.819,16.410 223.965,19.973 228.479 C 20.442 229.072,21.274 230.540,21.824 231.739 C 22.373 232.939,23.087 234.140,23.411 234.409 C 23.735 234.678,24.000 235.067,24.000 235.273 C 24.000 235.479,24.630 236.473,25.400 237.482 C 26.170 238.490,26.985 240.002,27.211 240.841 C 27.437 241.680,27.777 242.462,27.967 242.579 C 28.156 242.697,28.435 243.289,28.587 243.896 C 28.738 244.503,29.093 245.270,29.375 245.600 C 29.656 245.930,30.082 246.783,30.321 247.496 C 30.725 248.701,32.468 251.182,34.100 252.874 C 34.485 253.273,34.800 254.039,34.800 254.576 C 34.800 255.113,34.962 255.653,35.160 255.775 C 35.358 255.897,35.734 256.943,35.995 258.099 C 36.256 259.254,36.724 260.767,37.035 261.460 C 37.346 262.154,37.600 263.092,37.600 263.546 C 37.600 264.000,37.928 264.548,38.330 264.762 C 38.731 264.977,39.268 265.849,39.523 266.700 C 39.778 267.552,40.440 268.674,40.993 269.194 C 41.547 269.714,42.000 270.558,42.000 271.070 C 42.000 271.581,42.175 272.000,42.390 272.000 C 42.604 272.000,43.079 272.585,43.446 273.300 C 45.091 276.509,52.543 284.190,56.800 287.064 C 62.427 290.863,69.781 293.386,78.200 294.405 C 84.035 295.112,92.568 296.632,99.200 298.148 C 104.176 299.285,111.056 299.956,119.931 300.171 C 124.844 300.289,131.265 300.685,134.200 301.051 C 140.869 301.881,150.884 301.220,159.200 299.400 C 163.521 298.455,176.094 298.171,179.058 298.952 C 180.409 299.309,182.310 299.600,183.280 299.600 C 184.534 299.600,185.437 299.889,186.400 300.600 C 187.145 301.150,188.215 301.601,188.778 301.602 C 189.340 301.604,190.303 301.867,190.917 302.188 C 191.531 302.508,192.701 302.887,193.517 303.030 C 194.333 303.173,195.360 303.510,195.800 303.780 C 196.240 304.050,197.966 304.739,199.635 305.311 C 203.398 306.602,208.560 309.029,209.211 309.813 C 209.479 310.136,209.907 310.400,210.161 310.400 C 211.209 310.400,216.076 316.108,218.063 319.668 C 218.428 320.321,218.975 321.158,219.279 321.528 C 220.055 322.472,221.200 325.092,221.200 325.925 C 221.200 326.308,221.452 326.982,221.761 327.423 C 222.069 327.863,222.534 329.028,222.794 330.012 C 223.873 334.091,224.583 335.891,225.759 337.527 C 226.813 338.994,232.757 345.225,234.462 346.650 C 234.758 346.897,235.669 347.842,236.488 348.750 C 237.306 349.657,238.161 350.400,238.388 350.400 C 238.614 350.400,238.800 350.601,238.800 350.847 C 238.800 351.092,239.880 352.360,241.200 353.664 C 242.520 354.967,243.600 356.107,243.600 356.197 C 243.600 356.287,244.140 357.160,244.800 358.138 C 245.460 359.116,246.000 360.043,246.000 360.197 C 246.000 360.798,253.298 367.596,254.814 368.408 C 255.347 368.693,256.037 369.180,256.348 369.491 C 256.658 369.801,257.382 370.356,257.956 370.724 C 259.409 371.654,262.441 373.928,263.400 374.806 C 265.520 376.748,267.619 378.531,269.890 380.319 C 271.260 381.397,275.287 385.097,278.839 388.540 L 285.298 394.800 290.949 394.717 C 295.565 394.649,295.904 394.610,292.802 394.501 C 288.450 394.348,286.839 393.358,285.913 390.268 C 285.629 389.320,285.087 388.549,284.524 388.292 C 284.016 388.061,283.600 387.698,283.600 387.487 C 283.600 387.275,283.342 387.317,283.026 387.579 C 282.101 388.346,280.860 387.466,281.099 386.214 C 281.212 385.627,281.108 385.200,280.855 385.200 C 280.614 385.200,280.066 384.513,279.637 383.673 C 278.539 381.520,277.643 380.823,277.137 381.727 C 276.924 382.107,276.579 382.311,276.369 382.181 C 276.159 382.051,276.083 381.789,276.201 381.599 C 276.318 381.409,275.880 380.938,275.226 380.552 C 274.490 380.117,273.993 379.461,273.919 378.825 C 273.822 377.992,273.557 377.777,272.501 377.675 C 270.918 377.522,270.368 376.119,271.321 374.664 C 271.721 374.055,271.805 373.539,271.565 373.167 C 271.364 372.855,271.010 371.914,270.778 371.075 C 270.434 369.833,270.194 369.573,269.482 369.675 C 268.420 369.827,268.143 370.886,268.954 371.697 C 269.645 372.388,269.099 373.200,267.944 373.200 C 266.959 373.200,266.669 372.546,266.717 370.437 C 266.772 368.043,266.538 367.329,265.621 367.090 C 265.207 366.981,264.428 366.194,263.889 365.341 C 262.652 363.381,261.790 362.665,260.456 362.490 C 258.823 362.275,258.667 361.819,259.777 360.500 C 260.869 359.202,261.012 358.554,260.413 357.607 C 260.118 357.140,259.897 357.350,259.380 358.586 L 258.723 360.159 257.995 359.193 C 257.595 358.662,257.170 357.502,257.052 356.614 C 256.934 355.726,256.722 354.346,256.580 353.547 C 256.244 351.644,256.676 351.438,259.473 352.169 C 262.531 352.967,263.985 351.899,262.839 349.695 C 262.640 349.313,262.251 348.232,261.973 347.294 C 261.565 345.917,261.326 345.633,260.731 345.822 C 259.530 346.203,259.043 344.385,260.119 343.538 L 260.961 342.875 259.880 341.316 C 258.999 340.044,258.800 339.314,258.800 337.348 C 258.800 334.955,257.837 333.200,256.523 333.200 C 255.832 333.200,255.094 332.113,255.581 331.812 C 256.161 331.453,256.105 330.128,255.455 328.862 C 254.156 326.328,253.998 325.204,254.935 325.154 C 255.738 325.111,255.743 325.095,255.000 324.931 C 252.879 324.464,252.014 323.842,251.261 322.240 C 250.364 320.332,249.828 319.813,248.400 319.470 C 247.739 319.310,247.072 318.605,246.431 317.389 C 245.445 315.518,243.931 314.400,242.381 314.400 C 241.871 314.400,240.440 313.365,238.861 311.854 L 236.200 309.308 233.268 309.075 C 231.424 308.928,229.839 308.548,228.996 308.051 C 228.259 307.616,227.297 307.354,226.858 307.469 C 226.264 307.624,225.899 307.365,225.427 306.453 C 224.852 305.341,224.646 305.243,223.183 305.388 C 222.297 305.477,221.033 305.361,220.374 305.131 C 219.051 304.670,217.208 305.211,215.855 306.457 C 213.474 308.651,209.368 308.295,203.376 305.376 C 201.823 304.619,200.078 304.000,199.499 304.000 C 198.870 304.000,198.199 303.649,197.835 303.128 C 197.382 302.481,196.626 302.181,194.912 301.968 C 192.389 301.653,190.400 300.870,188.714 299.528 C 187.846 298.838,187.041 298.653,184.714 298.607 C 182.558 298.564,181.085 298.261,179.051 297.442 C 176.484 296.409,176.136 296.364,173.818 296.768 C 172.452 297.005,168.992 297.200,166.130 297.200 C 161.967 297.200,160.460 297.360,158.600 298.000 C 157.321 298.440,155.448 298.801,154.437 298.802 C 153.427 298.804,152.109 299.061,151.508 299.375 C 149.970 300.177,138.481 300.591,133.800 300.013 C 131.820 299.769,125.160 299.401,119.000 299.196 C 106.781 298.789,105.888 298.688,98.136 296.849 C 95.240 296.162,92.376 295.600,91.771 295.600 C 91.166 295.600,89.754 295.339,88.635 295.020 C 85.864 294.230,80.075 293.279,76.200 292.977 C 72.782 292.711,69.586 291.943,68.232 291.062 C 67.774 290.764,66.680 290.394,65.800 290.239 C 62.909 289.730,62.710 289.612,62.975 288.556 C 63.209 287.625,63.157 287.597,61.628 287.842 C 60.171 288.075,59.922 287.974,58.671 286.648 C 57.920 285.852,56.922 285.200,56.453 285.200 C 55.984 285.200,55.600 285.049,55.600 284.864 C 55.600 284.680,55.150 284.323,54.600 284.073 C 54.050 283.822,53.600 283.343,53.600 283.009 C 53.600 282.674,53.429 282.400,53.221 282.400 C 52.546 282.400,50.719 280.454,50.987 280.021 C 51.491 279.205,53.201 279.552,53.579 280.545 C 53.911 281.417,54.733 282.000,55.633 282.000 C 56.229 282.000,56.054 281.284,55.269 280.516 C 53.664 278.944,52.329 276.769,51.877 274.987 C 51.479 273.423,51.133 272.963,49.800 272.225 C 48.862 271.706,47.928 270.773,47.543 269.970 C 46.637 268.080,45.424 267.073,43.465 266.586 C 41.852 266.184,41.788 266.106,41.426 264.082 C 41.083 262.160,40.970 262.001,40.026 262.096 C 39.035 262.197,38.997 262.119,38.921 259.800 C 38.877 258.480,38.382 255.999,37.821 254.288 C 37.259 252.576,36.800 250.855,36.800 250.463 C 36.800 250.071,36.404 249.326,35.920 248.806 C 35.436 248.287,35.031 247.398,35.020 246.831 C 35.004 246.001,34.827 245.824,34.113 245.923 C 33.439 246.016,33.163 245.792,32.960 244.984 C 32.814 244.400,32.126 243.175,31.432 242.261 C 29.540 239.770,29.076 238.352,29.395 236.034 C 29.907 232.313,28.346 229.952,26.315 231.374 C 24.736 232.481,24.000 232.195,24.000 230.476 C 24.000 229.639,23.736 228.604,23.413 228.176 C 23.090 227.749,22.820 227.014,22.813 226.543 C 22.800 225.662,22.102 225.200,20.785 225.200 C 20.231 225.200,19.970 224.809,19.783 223.700 C 19.358 221.177,19.165 220.767,18.199 220.327 C 16.996 219.779,16.824 219.021,17.264 216.212 C 17.499 214.714,17.473 213.128,17.191 211.657 C 16.804 209.646,16.461 205.832,15.732 195.446 C 15.491 192.013,16.431 187.293,17.481 186.670 C 18.060 186.326,20.000 182.270,20.000 181.405 C 20.000 181.132,20.427 180.480,20.949 179.955 C 21.852 179.046,22.279 177.363,22.970 172.000 C 23.421 168.502,24.356 165.249,25.338 163.765 C 26.141 162.552,26.554 161.155,26.990 158.174 C 27.310 155.988,27.670 153.570,27.791 152.800 C 27.912 152.030,28.210 149.870,28.454 148.000 C 28.923 144.403,29.262 143.429,30.435 142.302 C 31.106 141.658,31.115 141.495,30.554 140.151 C 30.070 138.993,30.040 138.469,30.407 137.584 C 30.660 136.972,30.807 135.883,30.734 135.165 C 30.611 133.969,30.753 133.781,32.400 132.952 C 35.214 131.536,37.110 129.779,36.500 129.153 C 35.511 128.138,35.857 125.077,36.931 125.347 C 37.695 125.539,37.975 125.342,38.497 124.247 C 38.952 123.293,39.484 122.843,40.366 122.667 C 41.305 122.479,41.603 122.202,41.613 121.510 C 41.636 119.868,42.594 119.062,44.211 119.324 C 45.608 119.551,45.647 119.524,45.428 118.479 C 45.303 117.886,45.357 117.159,45.546 116.865 C 45.778 116.505,45.516 115.919,44.745 115.076 C 43.985 114.244,43.600 113.392,43.600 112.544 C 43.600 111.841,43.491 110.981,43.357 110.633 C 43.180 110.172,43.358 110.000,44.010 110.000 C 45.068 110.000,47.429 108.622,47.735 107.826 C 47.852 107.520,48.995 107.045,50.274 106.772 C 51.801 106.446,53.019 105.885,53.819 105.138 C 54.813 104.210,55.398 104.000,56.988 104.000 C 58.162 104.000,59.201 103.761,59.603 103.398 C 60.196 102.860,60.415 102.870,61.634 103.489 C 63.534 104.455,69.987 104.753,68.300 103.797 C 66.813 102.955,66.907 102.800,68.905 102.800 C 70.290 102.800,70.685 102.969,71.005 103.700 C 71.242 104.240,71.820 104.649,72.449 104.722 C 74.187 104.923,75.022 107.370,74.901 111.912 C 74.830 114.578,74.969 115.967,75.390 116.781 C 75.912 117.790,75.909 117.977,75.366 118.428 C 74.918 118.800,74.821 119.341,75.007 120.439 C 75.154 121.311,75.067 122.301,74.799 122.802 C 74.185 123.950,73.962 126.262,73.805 133.128 C 73.706 137.454,73.530 139.020,73.085 139.528 C 72.168 140.575,71.334 142.461,71.092 144.036 C 70.970 144.826,70.331 146.356,69.672 147.436 C 67.900 150.339,65.238 156.469,64.851 158.537 C 64.608 159.838,64.051 160.827,62.861 162.072 C 61.952 163.022,61.207 164.161,61.204 164.603 C 61.202 165.045,60.772 166.215,60.249 167.203 C 59.726 168.191,59.167 169.630,59.006 170.400 C 58.845 171.170,58.368 172.370,57.945 173.067 C 57.490 173.816,57.202 174.960,57.239 175.867 C 57.274 176.710,57.166 179.290,57.000 181.600 C 56.765 184.847,56.835 186.345,57.306 188.200 C 57.641 189.520,58.038 191.950,58.189 193.600 C 58.574 197.812,59.105 199.585,60.336 200.772 C 60.923 201.337,61.875 202.430,62.452 203.200 C 65.298 206.996,66.981 208.400,68.687 208.400 C 69.670 208.400,71.248 208.855,72.659 209.545 C 73.947 210.175,75.858 210.802,76.907 210.939 C 80.320 211.383,83.148 213.616,82.020 214.976 C 81.674 215.393,81.661 215.767,81.972 216.348 C 82.208 216.788,82.400 217.749,82.400 218.485 C 82.400 219.865,82.872 220.437,85.027 221.672 C 85.828 222.132,86.797 223.507,88.086 226.014 C 89.124 228.032,90.400 230.079,90.923 230.564 C 91.446 231.048,92.037 231.711,92.237 232.036 C 92.882 233.088,94.882 234.400,95.840 234.400 C 96.353 234.400,97.363 234.914,98.086 235.541 C 98.809 236.169,99.823 236.905,100.340 237.177 C 101.248 237.654,101.271 237.786,101.027 241.135 C 100.500 248.372,100.475 248.103,101.692 248.432 C 102.293 248.594,103.373 249.346,104.092 250.102 C 104.812 250.859,105.587 251.550,105.816 251.639 C 107.649 252.348,109.140 256.507,108.361 258.740 C 107.857 260.184,107.724 260.236,106.757 259.361 C 105.534 258.254,104.066 260.271,104.763 262.100 C 105.881 265.034,109.153 266.837,109.779 264.865 C 109.901 264.483,111.080 263.209,112.400 262.033 C 113.720 260.857,114.800 259.595,114.800 259.228 C 114.800 257.348,118.141 256.867,118.818 258.649 C 119.077 259.328,119.080 259.862,118.829 260.166 C 118.010 261.152,118.132 264.851,119.000 265.345 C 120.065 265.951,120.369 266.417,120.120 267.064 C 120.001 267.375,120.184 267.600,120.557 267.600 C 120.933 267.600,121.200 267.932,121.200 268.400 C 121.200 269.247,121.789 270.051,123.900 272.091 C 124.870 273.028,125.200 273.696,125.200 274.719 C 125.200 275.474,125.548 276.746,125.972 277.546 C 126.397 278.345,126.855 279.674,126.990 280.499 C 127.125 281.323,127.633 282.407,128.118 282.909 C 129.820 284.667,134.140 288.400,134.473 288.400 C 134.657 288.400,135.600 288.772,136.566 289.226 C 142.790 292.152,153.682 292.388,162.054 289.778 C 163.073 289.460,164.153 289.194,164.454 289.187 C 164.754 289.181,166.075 288.641,167.390 287.987 C 168.911 287.232,170.398 286.800,171.481 286.800 C 172.856 286.800,173.308 286.608,173.840 285.795 C 174.202 285.243,174.969 284.672,175.545 284.528 C 176.121 284.383,176.813 284.070,177.082 283.833 C 178.343 282.720,178.739 282.482,180.057 282.047 C 181.596 281.539,183.366 279.879,183.758 278.575 C 184.046 277.618,188.586 272.791,189.753 272.200 C 190.188 271.980,190.673 271.315,190.831 270.723 C 190.989 270.131,191.579 268.691,192.142 267.523 C 193.148 265.434,193.539 264.055,194.413 259.507 C 194.758 257.713,195.001 257.238,195.527 257.326 C 196.799 257.540,197.993 258.426,198.606 259.612 C 199.070 260.508,199.501 260.800,200.361 260.800 C 200.989 260.800,201.717 261.059,201.980 261.376 C 202.243 261.693,202.939 262.008,203.526 262.076 C 205.033 262.251,205.774 263.907,205.228 265.883 C 204.406 268.859,210.513 272.567,213.171 270.705 C 214.573 269.723,218.800 265.625,218.800 265.248 C 218.800 265.049,219.070 264.782,219.400 264.655 C 220.210 264.344,220.158 263.706,219.300 263.425 C 218.915 263.299,218.200 262.578,217.712 261.822 C 217.224 261.066,215.964 259.951,214.912 259.344 C 213.860 258.737,212.856 258.006,212.680 257.720 C 212.504 257.434,212.128 257.200,211.844 257.200 C 210.240 257.200,210.337 253.928,211.957 253.414 C 212.373 253.282,212.941 252.624,213.219 251.953 C 213.789 250.577,214.953 250.000,217.155 250.000 C 218.808 250.000,221.971 246.064,222.592 243.235 C 222.759 242.476,223.465 241.503,224.387 240.762 C 225.515 239.855,225.971 239.143,226.154 237.997 C 226.505 235.800,229.266 233.863,229.855 235.400 C 229.982 235.730,230.336 236.000,230.643 236.000 C 230.949 236.000,231.203 236.135,231.206 236.300 C 231.241 238.021,233.600 237.548,233.600 235.819 C 233.600 234.580,234.909 231.539,235.739 230.851 C 236.095 230.555,236.697 229.328,237.077 228.124 C 237.586 226.509,238.060 225.783,238.883 225.357 C 239.498 225.039,240.000 224.634,240.000 224.456 C 240.000 224.105,241.342 222.773,243.700 220.783 C 244.773 219.877,245.200 219.199,245.200 218.400 C 245.200 217.565,245.679 216.870,247.100 215.642 L 249.000 214.001 248.119 213.252 L 247.239 212.503 248.199 211.601 C 248.727 211.105,249.276 210.137,249.419 209.450 C 249.710 208.055,252.015 204.405,253.700 202.671 C 254.305 202.048,254.800 201.282,254.800 200.969 C 254.800 199.970,256.305 198.850,258.508 198.210 C 260.012 197.772,261.100 197.110,262.174 195.976 C 263.014 195.090,264.386 194.015,265.223 193.588 C 266.061 193.161,266.859 192.629,266.996 192.406 C 267.134 192.183,267.613 192.000,268.061 192.000 C 268.531 192.000,268.961 191.671,269.078 191.223 C 269.193 190.783,270.013 190.143,270.967 189.748 C 272.764 189.005,273.600 187.065,273.600 183.635 C 273.600 182.318,273.900 180.942,275.033 177.054 C 275.345 175.984,275.602 174.184,275.605 173.054 C 275.615 169.492,276.087 168.861,278.959 168.578 C 279.990 168.477,281.230 166.778,280.947 165.856 C 280.821 165.447,281.029 164.423,281.408 163.581 C 282.236 161.747,282.036 160.381,280.447 157.000 C 279.750 155.516,279.438 154.371,279.630 154.000 C 279.802 153.670,280.039 153.085,280.158 152.700 C 280.290 152.275,280.772 152.000,281.387 152.000 C 282.929 152.000,282.415 147.646,280.634 145.620 C 280.335 145.279,279.620 144.100,279.046 143.000 C 277.075 139.224,273.420 135.443,270.972 134.649 C 270.548 134.511,269.544 133.776,268.743 133.015 L 267.286 131.631 267.095 132.915 C 266.990 133.622,267.124 134.936,267.394 135.836 C 267.823 137.271,267.788 137.657,267.110 138.979 C 266.278 140.600,266.276 156.575,267.107 159.400 C 267.697 161.406,265.474 165.464,263.482 166.018 C 262.536 166.281,261.834 166.772,261.619 167.320 C 261.429 167.804,261.055 168.785,260.788 169.500 C 260.311 170.780,260.263 170.800,257.759 170.800 C 254.689 170.800,254.311 170.147,255.403 166.724 C 255.848 165.329,256.185 162.335,256.384 158.000 C 256.682 151.532,256.718 151.332,258.195 148.000 C 259.567 144.904,259.959 143.411,260.666 138.600 C 260.796 137.720,261.224 136.589,261.619 136.087 C 262.371 135.129,262.350 132.590,261.584 131.824 C 261.373 131.613,261.200 131.048,261.200 130.569 C 261.200 130.090,260.933 129.476,260.607 129.206 C 260.280 128.935,259.712 127.756,259.343 126.587 C 258.777 124.791,258.243 124.096,255.919 122.130 C 254.404 120.848,252.080 118.765,250.755 117.500 C 248.983 115.808,248.046 115.200,247.212 115.200 C 246.341 115.200,245.888 114.876,245.253 113.800 C 244.799 113.030,244.241 112.400,244.013 112.400 C 243.786 112.400,243.600 112.130,243.600 111.800 C 243.600 111.470,243.778 111.200,243.995 111.200 C 244.213 111.200,244.509 110.456,244.655 109.547 C 244.826 108.480,245.160 107.831,245.598 107.716 C 246.070 107.593,246.222 107.248,246.095 106.587 C 245.990 106.036,246.269 105.059,246.757 104.270 C 247.758 102.651,247.819 101.762,246.987 100.930 C 246.437 100.380,246.449 100.189,247.110 99.059 C 247.938 97.641,249.066 97.349,248.883 98.600 C 248.272 102.794,248.266 102.725,249.385 104.055 C 250.141 104.954,250.421 105.673,250.310 106.430 C 250.104 107.837,252.037 109.200,253.048 108.361 C 253.556 107.938,253.615 107.151,253.397 103.627 C 253.107 98.927,253.559 96.915,255.395 94.733 C 255.948 94.076,256.400 93.304,256.400 93.018 C 256.400 92.732,256.670 92.274,257.000 92.000 C 257.370 91.693,257.600 90.814,257.600 89.705 C 257.600 88.141,257.794 87.731,259.091 86.542 C 260.711 85.059,260.648 84.216,258.857 83.401 C 257.925 82.976,257.849 81.983,258.726 81.691 C 259.019 81.594,259.353 81.898,259.477 82.374 C 259.601 82.846,259.904 83.166,260.151 83.085 C 260.737 82.892,260.985 81.200,260.428 81.200 C 260.193 81.200,260.000 80.930,260.000 80.600 C 260.000 79.911,260.628 79.799,261.012 80.419 C 261.495 81.201,262.485 79.927,262.262 78.811 C 262.099 77.993,262.321 77.570,263.323 76.788 C 265.033 75.455,269.767 71.105,269.933 70.714 C 270.007 70.541,270.485 70.400,270.996 70.400 C 271.712 70.400,271.880 70.226,271.726 69.639 C 271.589 69.113,271.786 68.795,272.363 68.612 C 272.824 68.466,273.200 68.067,273.200 67.726 C 273.200 67.311,273.455 67.173,273.974 67.309 C 274.424 67.427,274.839 67.277,274.964 66.950 C 275.082 66.641,275.634 66.215,276.190 66.004 C 276.745 65.793,277.200 65.345,277.200 65.010 C 277.200 64.664,277.551 64.400,278.013 64.400 C 278.736 64.400,279.543 63.410,279.145 63.011 C 279.060 62.926,278.140 63.474,277.101 64.229 M368.102 77.534 C 365.325 78.662,364.828 79.471,365.362 82.000 C 365.989 84.978,366.569 85.172,368.555 83.069 C 369.675 81.884,370.665 81.198,371.260 81.195 C 374.285 81.177,374.790 79.977,372.586 78.041 C 370.978 76.629,370.472 76.572,368.102 77.534 M386.000 95.186 C 386.000 110.077,386.717 108.363,380.047 109.419 C 376.612 109.963,375.231 110.362,374.420 111.044 C 373.830 111.541,372.881 112.065,372.313 112.207 C 371.231 112.479,369.600 113.783,369.600 114.376 C 369.600 114.566,369.105 114.909,368.500 115.138 C 366.538 115.880,361.878 120.800,363.137 120.800 C 363.309 120.800,364.209 120.433,365.138 119.984 C 366.066 119.536,367.003 119.278,367.219 119.412 C 367.435 119.545,368.580 119.453,369.763 119.208 C 371.819 118.781,378.188 118.594,383.478 118.805 C 385.814 118.898,385.966 118.964,386.118 119.952 L 386.280 121.000 386.340 119.890 C 386.430 118.225,385.139 117.915,377.200 117.694 C 369.303 117.474,367.633 117.024,370.057 115.771 C 370.796 115.389,372.033 114.568,372.806 113.947 C 374.432 112.640,378.607 111.116,382.521 110.400 C 386.673 109.640,386.400 110.683,386.400 95.571 C 386.400 88.327,386.310 82.400,386.200 82.400 C 386.090 82.400,386.000 88.154,386.000 95.186 M257.200 85.000 C 257.200 85.333,256.844 85.600,256.400 85.600 C 255.415 85.600,255.342 84.926,256.300 84.676 C 256.685 84.575,257.045 84.472,257.100 84.446 C 257.155 84.421,257.200 84.670,257.200 85.000 M256.400 89.600 C 256.400 89.820,256.130 90.000,255.800 90.000 C 255.470 90.000,255.200 89.820,255.200 89.600 C 255.200 89.380,255.470 89.200,255.800 89.200 C 256.130 89.200,256.400 89.380,256.400 89.600 M253.200 92.200 C 253.608 92.691,253.580 92.800,253.049 92.800 C 252.692 92.800,252.400 92.530,252.400 92.200 C 252.400 91.870,252.468 91.600,252.551 91.600 C 252.634 91.600,252.926 91.870,253.200 92.200 M126.000 94.406 C 125.670 94.623,124.754 94.979,123.965 95.198 C 118.604 96.684,122.843 106.752,130.107 109.787 C 130.974 110.149,131.676 110.817,131.993 111.582 C 132.447 112.680,132.672 112.800,134.265 112.800 C 135.429 112.800,136.303 113.051,136.823 113.536 C 137.258 113.941,138.105 114.518,138.707 114.819 C 139.308 115.120,140.546 115.955,141.457 116.675 C 144.709 119.242,150.128 119.065,150.557 116.376 C 150.862 114.472,150.893 114.458,155.017 114.262 C 160.107 114.020,166.006 110.905,165.995 108.464 C 165.984 106.187,163.085 103.872,160.627 104.179 C 158.319 104.468,157.200 103.885,157.200 102.393 C 157.200 101.787,157.564 101.615,159.100 101.492 C 160.145 101.408,159.380 101.347,157.400 101.356 C 154.316 101.370,153.484 101.222,151.600 100.321 C 148.383 98.784,145.691 97.966,144.047 98.029 C 143.251 98.059,142.015 97.952,141.300 97.792 C 140.083 97.519,139.963 97.592,139.395 98.950 C 139.062 99.748,138.698 100.400,138.586 100.400 C 137.954 100.400,135.191 98.192,135.141 97.647 C 135.108 97.291,135.063 96.687,135.041 96.305 C 134.938 94.553,127.997 93.095,126.000 94.406 M130.896 97.836 C 130.769 99.424,130.858 100.389,131.150 100.569 C 131.397 100.722,131.600 101.341,131.600 101.944 C 131.600 105.688,126.839 103.924,126.245 99.960 C 125.762 96.738,126.736 95.382,129.534 95.382 L 131.093 95.382 130.896 97.836 M149.463 99.842 C 149.938 99.970,150.416 100.420,150.527 100.842 C 150.637 101.265,151.353 101.872,152.117 102.191 C 152.998 102.559,153.596 103.130,153.752 103.751 C 153.887 104.290,154.718 105.302,155.599 105.999 C 159.198 108.850,155.678 112.430,150.435 111.252 C 149.250 110.986,148.021 111.006,146.553 111.314 C 143.786 111.894,143.612 111.703,143.151 107.581 C 142.844 104.840,142.884 104.171,143.383 103.619 C 143.918 103.028,143.917 102.859,143.376 102.087 C 142.787 101.246,142.825 101.205,144.591 100.761 C 145.593 100.508,146.511 100.144,146.630 99.951 C 146.877 99.551,148.190 99.501,149.463 99.842 M244.080 104.880 C 243.707 105.253,243.600 105.147,243.600 104.400 C 243.600 103.653,243.707 103.547,244.080 103.920 C 244.453 104.293,244.453 104.507,244.080 104.880 M244.572 107.155 C 244.693 107.351,244.246 107.591,243.578 107.689 C 242.389 107.863,241.771 107.563,242.278 107.056 C 242.659 106.675,244.320 106.747,244.572 107.155 M241.340 109.413 C 241.216 109.736,240.954 110.000,240.757 110.000 C 240.347 110.000,240.275 109.059,240.656 108.678 C 241.082 108.251,241.580 108.786,241.340 109.413 M236.800 111.829 C 236.800 112.202,236.528 112.406,236.133 112.329 C 235.130 112.135,234.992 111.200,235.967 111.200 C 236.458 111.200,236.800 111.458,236.800 111.829 M146.400 114.400 C 146.400 114.840,146.220 115.200,146.000 115.200 C 145.780 115.200,145.600 114.840,145.600 114.400 C 145.600 113.960,145.780 113.600,146.000 113.600 C 146.220 113.600,146.400 113.960,146.400 114.400 M195.793 116.933 C 196.594 118.156,196.036 121.314,194.580 123.799 C 193.965 124.848,193.389 126.664,193.161 128.274 C 192.763 131.084,192.377 131.880,191.635 131.422 C 191.034 131.050,191.049 119.440,191.651 118.274 C 192.904 115.850,194.702 115.268,195.793 116.933 M213.700 118.435 C 214.720 120.226,215.074 124.802,214.289 126.036 C 212.985 128.085,212.665 131.133,213.327 135.211 C 214.439 142.071,214.537 142.976,214.428 145.400 C 214.306 148.125,214.313 148.111,213.111 148.199 C 211.713 148.302,211.142 147.550,211.937 146.652 C 212.561 145.949,212.541 145.867,211.600 145.264 C 211.050 144.911,210.027 144.032,209.327 143.311 C 208.627 142.590,207.802 142.000,207.494 142.000 C 206.566 142.000,206.362 141.505,207.000 140.800 C 207.676 140.053,207.486 138.651,206.060 133.883 L 205.247 131.166 206.058 129.791 C 206.761 128.600,206.833 128.021,206.594 125.468 C 206.274 122.056,206.724 120.804,208.844 119.200 C 211.987 116.823,212.717 116.708,213.700 118.435 M358.500 121.735 C 356.544 122.723,357.384 123.595,359.607 122.885 C 360.711 122.532,361.552 122.053,361.476 121.821 C 361.285 121.237,359.584 121.188,358.500 121.735 M350.600 123.600 C 350.160 123.789,349.325 123.956,348.744 123.972 C 348.163 123.987,346.903 124.356,345.944 124.791 C 344.985 125.226,343.505 125.586,342.656 125.591 C 340.377 125.604,329.519 130.528,327.200 132.601 C 326.870 132.896,325.652 133.612,324.493 134.193 C 323.334 134.774,322.103 135.681,321.757 136.209 C 321.411 136.737,320.740 137.292,320.264 137.443 C 319.789 137.594,318.609 138.321,317.642 139.058 C 316.676 139.796,315.670 140.400,315.408 140.400 C 315.145 140.400,313.925 141.120,312.696 142.000 C 311.467 142.880,310.342 143.600,310.196 143.600 C 310.051 143.600,306.842 145.108,303.066 146.951 C 299.290 148.794,295.750 150.439,295.200 150.605 C 294.650 150.772,293.845 151.154,293.411 151.454 C 292.977 151.754,292.341 152.000,291.998 152.000 C 291.654 152.000,290.439 152.602,289.297 153.338 C 286.621 155.062,287.019 155.710,291.283 156.575 C 296.102 157.552,298.436 157.286,303.600 155.174 C 304.590 154.769,306.030 154.318,306.800 154.172 C 307.570 154.026,308.380 153.792,308.600 153.653 C 309.461 153.108,313.626 152.522,313.480 152.966 C 313.402 153.205,312.728 153.459,311.981 153.532 C 309.816 153.742,305.202 157.637,306.473 158.181 C 306.983 158.399,307.501 158.719,307.625 158.891 C 307.749 159.064,309.549 160.083,311.625 161.156 C 315.698 163.261,318.782 165.238,320.447 166.811 C 324.157 170.317,325.654 170.551,328.059 168.001 C 329.146 166.849,329.737 166.511,330.372 166.677 C 331.586 166.994,332.656 165.860,332.965 163.929 C 333.109 163.030,333.940 161.072,334.813 159.577 C 335.686 158.083,336.400 156.709,336.400 156.523 C 336.400 155.628,341.809 149.600,342.612 149.600 C 342.885 149.600,343.380 149.195,343.712 148.700 C 344.044 148.205,344.965 147.080,345.758 146.200 C 347.335 144.450,347.508 144.000,346.606 144.000 C 346.280 144.000,344.885 143.453,343.506 142.785 C 342.128 142.117,339.881 141.411,338.514 141.217 C 334.722 140.679,334.352 140.239,336.653 139.000 C 337.452 138.569,338.531 137.544,339.050 136.720 C 339.570 135.897,340.492 134.958,341.098 134.635 C 341.704 134.311,342.723 133.586,343.362 133.023 C 344.001 132.461,344.655 132.000,344.815 132.000 C 344.974 132.000,345.621 131.493,346.253 130.874 C 346.884 130.255,348.750 128.957,350.400 127.989 C 354.494 125.588,357.198 123.732,356.956 123.489 C 356.638 123.171,355.200 123.651,355.200 124.075 C 355.200 124.285,354.917 124.174,354.571 123.829 C 353.897 123.154,351.904 123.040,350.600 123.600 M345.791 127.585 C 346.092 128.072,344.144 131.200,343.540 131.200 C 343.292 131.200,342.259 131.933,341.245 132.830 C 336.600 136.933,335.389 137.842,331.923 139.827 C 330.891 140.418,329.959 141.131,329.851 141.411 C 329.744 141.691,328.968 142.145,328.128 142.420 C 327.288 142.696,326.060 143.317,325.400 143.802 C 324.740 144.286,323.871 144.798,323.468 144.940 C 323.066 145.083,321.806 145.800,320.668 146.534 C 314.125 150.756,315.517 150.189,301.972 154.145 C 294.621 156.291,290.142 154.790,295.664 152.031 C 297.019 151.354,298.324 150.799,298.564 150.797 C 298.804 150.795,300.350 150.028,302.000 149.091 C 303.650 148.155,306.710 146.606,308.800 145.649 C 310.890 144.692,313.531 143.299,314.668 142.554 C 315.805 141.809,316.913 141.200,317.130 141.200 C 317.347 141.200,318.253 140.615,319.143 139.900 C 320.033 139.185,321.303 138.240,321.964 137.800 C 322.625 137.360,324.478 136.090,326.083 134.978 C 333.805 129.626,344.559 125.592,345.791 127.585 M133.200 129.880 C 132.870 129.999,131.970 130.687,131.200 131.409 C 130.294 132.258,129.214 132.815,128.137 132.989 C 125.735 133.377,125.149 133.970,124.765 136.397 C 124.519 137.949,124.095 138.877,123.214 139.786 C 122.546 140.475,122.000 141.394,122.000 141.830 C 122.000 142.266,121.727 143.011,121.394 143.487 C 121.052 143.975,120.812 145.100,120.843 146.076 C 120.912 148.287,120.485 150.994,119.766 152.908 C 118.614 155.977,119.284 160.056,121.477 163.315 C 122.224 164.424,122.738 165.585,122.619 165.895 C 122.500 166.205,122.583 166.795,122.804 167.208 C 123.025 167.620,123.460 169.289,123.772 170.917 C 124.541 174.938,125.304 176.615,126.661 177.265 C 127.707 177.766,127.847 178.109,128.455 181.663 C 129.283 186.506,129.817 187.646,130.200 185.388 C 130.596 183.060,130.814 182.400,131.190 182.400 C 131.747 182.400,133.125 187.010,132.908 188.145 C 132.761 188.914,132.873 189.200,133.320 189.200 C 133.657 189.200,134.009 189.425,134.101 189.700 C 134.233 190.091,134.498 190.078,135.321 189.640 C 135.899 189.332,136.290 188.945,136.189 188.782 C 136.087 188.618,136.288 188.375,136.635 188.242 C 137.711 187.829,138.815 187.975,139.039 188.559 C 139.652 190.154,144.000 189.681,144.000 188.019 C 144.000 186.817,144.699 186.052,146.746 185.014 L 148.091 184.332 147.817 181.866 C 147.335 177.529,147.398 176.866,148.400 175.800 C 148.917 175.250,149.591 174.800,149.899 174.800 C 150.972 174.800,150.202 173.433,148.989 173.185 C 147.152 172.809,145.686 171.673,145.221 170.264 C 144.991 169.566,144.352 168.508,143.801 167.914 C 142.375 166.376,142.545 166.000,144.669 166.000 C 145.826 166.000,146.808 165.755,147.250 165.355 C 147.642 165.000,148.810 164.652,149.844 164.583 C 151.312 164.484,151.911 164.223,152.571 163.395 C 153.409 162.345,153.424 162.342,154.131 163.124 C 155.623 164.773,156.797 163.376,158.231 158.243 C 158.594 156.946,158.802 155.226,158.693 154.421 C 158.334 151.740,160.062 150.700,161.554 152.700 L 162.375 153.800 162.387 152.434 C 162.433 147.492,156.726 141.800,155.342 145.407 C 155.160 145.882,154.981 145.916,154.551 145.559 C 154.245 145.306,153.411 144.980,152.698 144.835 C 149.760 144.239,151.558 140.712,155.311 139.708 C 157.253 139.189,157.737 138.387,157.332 136.361 C 156.889 134.146,156.064 133.837,150.476 133.790 C 145.632 133.750,145.279 133.689,142.761 132.474 C 141.310 131.773,139.864 131.200,139.547 131.200 C 139.231 131.200,137.948 130.840,136.696 130.400 C 134.297 129.557,134.153 129.535,133.200 129.880 M348.854 139.016 C 348.114 139.337,346.809 139.600,345.954 139.600 C 344.150 139.600,343.914 140.235,345.494 140.836 C 346.239 141.119,347.100 141.123,348.194 140.848 C 349.077 140.627,350.315 140.336,350.945 140.204 C 352.053 139.970,352.067 139.937,351.383 139.181 C 350.551 138.262,350.584 138.265,348.854 139.016 M144.899 141.979 C 144.837 142.524,145.341 143.505,146.199 144.507 C 146.969 145.407,147.600 146.360,147.600 146.623 C 147.600 146.886,147.882 147.336,148.226 147.622 C 149.879 148.993,150.082 150.277,148.869 151.684 C 147.173 153.652,147.090 154.230,148.203 156.321 C 150.454 160.549,146.733 164.725,142.625 162.582 C 141.937 162.224,141.004 162.067,140.374 162.206 C 136.681 163.017,135.993 151.024,139.509 147.132 C 140.594 145.932,141.028 145.044,141.187 143.707 C 141.379 142.080,141.538 141.852,142.800 141.401 C 144.594 140.760,145.024 140.878,144.899 141.979 M128.363 146.555 C 128.680 146.937,128.703 147.406,128.437 148.055 C 128.225 148.575,127.943 149.664,127.812 150.476 C 127.317 153.530,123.600 154.504,123.600 151.580 C 123.600 148.232,126.881 144.770,128.363 146.555 M386.174 156.000 C 386.174 161.610,386.230 163.905,386.299 161.100 C 386.368 158.295,386.368 153.705,386.299 150.900 C 386.230 148.095,386.174 150.390,386.174 156.000 M325.049 147.106 C 325.295 147.268,325.989 148.345,326.590 149.500 C 327.192 150.655,327.839 151.600,328.028 151.600 C 329.011 151.600,329.224 153.243,328.392 154.411 C 326.904 156.501,321.989 155.270,322.004 152.811 C 322.006 152.475,321.468 151.750,320.808 151.200 C 318.680 149.425,322.686 145.558,325.049 147.106 M324.236 152.651 C 323.858 153.635,324.739 154.400,326.249 154.400 C 327.483 154.400,327.600 154.296,327.600 153.200 C 327.600 151.788,324.746 151.322,324.236 152.651 M318.990 154.373 C 319.425 154.938,320.261 155.890,320.848 156.488 C 323.280 158.968,326.453 165.972,325.607 166.992 C 325.013 167.707,324.466 167.483,321.021 165.113 C 317.177 162.469,315.846 161.586,312.700 159.596 C 311.215 158.657,310.000 157.824,310.000 157.744 C 310.000 157.351,311.657 156.093,313.351 155.200 C 314.395 154.650,315.518 153.905,315.847 153.543 C 316.626 152.689,317.966 153.042,318.990 154.373 M132.224 155.445 C 132.076 156.036,132.368 157.160,133.015 158.491 C 133.954 160.421,134.019 160.878,133.776 163.869 C 133.560 166.533,133.630 167.307,134.155 168.058 C 135.021 169.293,134.967 170.504,133.959 172.480 C 133.347 173.680,133.183 174.534,133.357 175.622 C 133.530 176.705,133.441 177.175,133.035 177.331 C 132.305 177.611,131.969 176.282,131.740 172.210 C 131.625 170.158,131.347 168.784,130.963 168.359 C 130.635 167.996,130.262 167.057,130.134 166.272 C 129.951 165.142,129.653 164.757,128.706 164.427 C 127.851 164.129,127.580 163.829,127.755 163.372 C 127.890 163.022,128.000 162.508,128.000 162.231 C 128.000 161.955,128.463 161.517,129.030 161.259 L 130.059 160.790 129.178 159.365 C 128.239 157.845,128.622 156.000,129.877 156.000 C 130.176 156.000,130.590 155.553,130.797 155.008 C 131.301 153.683,132.569 154.072,132.224 155.445 M294.485 163.100 C 294.742 163.705,295.098 164.371,295.276 164.580 C 295.716 165.096,295.684 172.260,295.233 174.000 C 295.034 174.770,294.753 176.263,294.608 177.317 C 294.432 178.602,293.965 179.668,293.189 180.551 C 292.538 181.293,291.841 182.723,291.594 183.825 C 291.353 184.902,290.716 186.359,290.178 187.065 C 289.144 188.419,288.939 189.391,289.599 189.799 C 289.850 189.954,289.776 190.473,289.399 191.203 C 288.091 193.731,289.817 194.719,292.491 192.973 C 293.312 192.438,294.266 192.000,294.611 192.000 C 298.042 192.000,302.400 185.157,302.400 179.771 C 302.400 179.158,302.598 178.104,302.840 177.428 C 303.214 176.387,303.092 175.630,302.040 172.447 C 301.358 170.383,300.800 168.212,300.800 167.622 C 300.800 166.437,299.314 164.855,297.460 164.066 C 296.833 163.799,296.227 163.225,296.113 162.790 C 295.981 162.285,295.566 162.000,294.962 162.000 C 294.085 162.000,294.051 162.079,294.485 163.100 M386.181 213.800 C 386.181 221.940,386.234 225.213,386.300 221.074 C 386.365 216.934,386.365 210.274,386.299 206.274 C 386.234 202.273,386.181 205.660,386.181 213.800 M306.150 203.990 C 304.435 204.691,302.000 207.415,301.994 208.638 C 301.991 209.277,301.824 210.059,301.623 210.376 C 300.256 212.536,305.218 214.921,308.800 213.826 C 314.375 212.121,315.512 205.217,310.381 204.228 C 307.632 203.698,306.956 203.660,306.150 203.990 M122.104 206.100 C 121.572 206.773,121.569 208.007,122.096 209.094 C 122.874 210.701,126.800 210.649,126.800 209.032 C 126.800 206.679,123.347 204.524,122.104 206.100 M311.418 206.582 C 313.169 208.333,312.157 211.238,309.600 211.800 C 308.945 211.944,308.306 212.228,308.181 212.431 C 307.282 213.885,304.000 212.159,304.000 210.231 C 304.000 206.775,309.102 204.265,311.418 206.582 M138.433 231.600 C 138.635 231.600,138.800 231.843,138.800 232.139 C 138.800 232.436,139.510 232.999,140.378 233.390 C 143.354 234.732,144.655 237.756,142.596 238.546 C 142.257 238.676,142.117 238.559,142.237 238.247 C 142.358 237.932,141.812 237.490,140.820 237.101 C 139.720 236.669,139.069 236.105,138.777 235.333 C 138.542 234.710,137.891 233.720,137.331 233.133 C 136.299 232.050,136.387 230.956,137.473 231.373 C 137.799 231.498,138.231 231.600,138.433 231.600 M165.620 252.837 C 166.884 255.200,165.384 256.069,161.969 254.952 C 159.363 254.099,159.281 253.841,161.302 252.841 C 163.501 251.752,165.039 251.751,165.620 252.837 M188.185 253.064 C 191.367 255.215,191.376 263.254,188.200 266.568 C 187.320 267.486,186.023 268.890,185.317 269.689 C 184.611 270.488,183.801 271.289,183.517 271.471 C 182.872 271.882,180.721 275.035,180.099 276.481 C 179.575 277.701,178.079 278.599,175.886 279.010 C 174.784 279.217,174.400 279.487,174.400 280.057 C 174.400 280.889,172.822 281.724,172.255 281.193 C 171.771 280.740,172.304 280.017,173.439 279.585 C 174.259 279.273,174.400 278.953,174.400 277.401 C 174.400 275.853,174.548 275.516,175.393 275.130 C 176.435 274.656,176.833 270.176,175.889 269.549 C 174.583 268.681,173.118 270.753,173.945 272.298 C 174.173 272.723,174.289 273.415,174.204 273.835 C 174.118 274.256,173.952 275.063,173.834 275.630 C 173.144 278.949,157.681 282.705,154.200 280.400 C 153.540 279.963,152.688 279.604,152.306 279.603 C 151.924 279.601,150.754 279.079,149.706 278.442 C 148.658 277.806,147.170 277.154,146.400 276.994 C 142.797 276.247,139.727 272.400,142.734 272.400 C 143.151 272.400,143.921 272.077,144.446 271.682 C 144.971 271.287,146.165 270.630,147.100 270.221 C 148.035 269.813,148.800 269.301,148.800 269.083 C 148.800 268.693,150.428 270.086,153.112 272.773 C 157.255 276.919,161.545 276.263,159.430 271.806 C 158.491 269.828,158.614 268.140,159.751 267.395 C 161.036 266.553,166.548 265.954,168.083 266.489 C 169.506 266.985,171.200 266.258,171.200 265.151 C 171.200 263.952,171.987 262.648,173.326 261.631 C 174.026 261.098,175.488 259.456,176.573 257.983 C 178.706 255.087,179.533 254.889,182.206 256.641 C 183.294 257.354,183.600 257.036,183.600 255.195 C 183.600 252.488,185.812 251.459,188.185 253.064 M145.267 254.552 C 144.718 255.153,144.588 255.633,144.818 256.200 C 145.398 257.625,145.222 258.214,144.002 258.935 C 143.344 259.324,142.697 260.072,142.565 260.598 C 142.411 261.210,141.943 261.637,141.263 261.786 C 139.965 262.071,137.425 264.404,136.533 266.130 C 135.585 267.963,134.316 269.597,133.825 269.618 C 133.425 269.636,132.778 270.328,131.410 272.200 C 130.848 272.969,130.825 272.955,130.813 271.831 C 130.806 271.189,131.051 270.379,131.357 270.031 C 131.663 269.684,132.303 267.966,132.779 266.214 C 133.255 264.462,133.794 262.842,133.977 262.614 C 134.318 262.189,136.129 257.683,136.579 256.136 C 136.992 254.718,138.764 253.862,141.800 253.613 C 145.703 253.292,146.276 253.448,145.267 254.552 M161.078 258.779 C 161.190 259.207,161.579 259.636,161.941 259.732 C 162.303 259.828,161.766 259.928,160.747 259.954 C 158.989 259.998,157.879 259.054,158.710 258.223 C 159.269 257.664,160.886 258.044,161.078 258.779 M122.964 261.141 C 123.080 261.329,122.930 261.817,122.630 262.226 C 122.028 263.050,120.800 262.463,120.800 261.351 C 120.800 260.751,122.614 260.575,122.964 261.141 M153.769 265.018 C 154.184 266.673,153.620 266.969,152.356 265.758 C 150.901 264.364,150.902 264.000,152.357 264.000 C 153.262 264.000,153.569 264.221,153.769 265.018 M144.400 267.166 C 144.400 267.299,144.045 267.629,143.612 267.900 C 142.582 268.543,141.623 267.136,142.430 266.164 C 142.897 265.601,144.400 266.365,144.400 267.166 M110.213 266.779 C 109.918 267.257,110.426 268.507,111.129 269.034 C 111.857 269.580,113.600 269.276,113.600 268.602 C 113.600 267.649,110.655 266.064,110.213 266.779 M154.716 268.636 C 154.780 268.670,154.465 268.794,154.016 268.912 C 153.393 269.075,153.200 268.933,153.200 268.314 C 153.200 267.603,153.287 267.569,153.900 268.038 C 154.285 268.333,154.652 268.602,154.716 268.636 M386.181 282.600 C 386.180 290.520,386.234 293.817,386.299 289.926 C 386.365 286.035,386.365 279.555,386.300 275.526 C 386.234 271.497,386.181 274.680,386.181 282.600 M200.800 271.836 C 200.800 272.190,200.263 272.981,199.607 273.594 L 198.413 274.708 199.507 275.160 C 201.711 276.069,202.327 276.003,203.386 274.744 C 204.671 273.216,204.659 272.872,203.300 272.390 C 202.695 272.175,201.885 271.818,201.500 271.596 C 200.956 271.283,200.800 271.337,200.800 271.836 M120.198 272.803 C 119.885 273.309,120.999 273.763,121.800 273.455 C 122.130 273.329,122.400 273.039,122.400 272.813 C 122.400 272.281,120.526 272.273,120.198 272.803 M131.314 275.976 C 131.084 276.852,130.853 277.082,130.453 276.834 C 130.003 276.555,129.994 276.230,130.404 274.988 C 131.014 273.140,131.827 274.023,131.314 275.976 M164.211 284.418 C 165.068 285.805,160.268 287.922,155.043 288.461 C 152.819 288.690,150.254 288.967,149.343 289.076 C 146.569 289.407,144.496 287.499,145.899 285.908 C 146.426 285.311,147.345 285.212,152.555 285.190 C 156.152 285.175,159.572 284.943,161.000 284.616 C 164.053 283.918,163.908 283.927,164.211 284.418 M189.000 284.564 L 187.800 285.092 188.900 285.610 C 190.482 286.356,192.643 285.459,191.420 284.565 C 190.501 283.893,190.524 283.893,189.000 284.564 M180.600 286.427 C 180.160 286.601,180.036 286.756,180.324 286.772 C 180.612 286.787,180.748 286.961,180.626 287.158 C 180.504 287.355,180.671 287.618,180.996 287.743 C 181.337 287.874,181.757 287.654,181.987 287.225 C 182.467 286.327,181.809 285.949,180.600 286.427 M189.300 289.476 C 189.685 289.576,190.315 289.576,190.700 289.476 C 191.085 289.375,190.770 289.293,190.000 289.293 C 189.230 289.293,188.915 289.375,189.300 289.476 M219.155 312.816 C 220.378 314.096,221.021 316.275,220.582 317.657 C 220.287 318.586,217.773 316.269,216.587 313.975 C 215.350 311.582,217.185 310.754,219.155 312.816 M234.212 329.271 C 234.433 330.579,234.354 331.045,233.847 331.415 C 232.748 332.219,233.125 332.751,234.777 332.728 C 236.302 332.707,238.571 333.760,239.555 334.946 C 240.967 336.648,237.485 338.739,235.800 337.200 C 235.360 336.799,234.550 336.409,234.000 336.335 C 233.248 336.234,232.969 335.927,232.873 335.100 C 232.804 334.495,232.399 333.813,231.973 333.586 C 230.968 333.047,230.982 331.745,232.000 331.200 C 232.456 330.956,232.800 330.362,232.800 329.819 C 232.800 327.286,233.810 326.894,234.212 329.271 M230.167 335.253 C 229.687 336.030,228.800 335.566,228.800 334.538 C 228.800 333.506,228.822 333.496,229.591 334.191 C 230.025 334.585,230.285 335.063,230.167 335.253 M247.000 344.000 C 247.141 344.228,246.796 344.400,246.200 344.400 C 245.604 344.400,245.259 344.228,245.400 344.000 C 245.536 343.780,245.896 343.600,246.200 343.600 C 246.504 343.600,246.864 343.780,247.000 344.000 M244.772 350.747 C 245.196 351.541,244.980 352.000,244.180 352.000 C 243.912 352.000,243.607 351.550,243.502 351.000 C 243.272 349.799,244.169 349.620,244.772 350.747 M253.587 351.500 C 253.542 352.564,252.400 353.311,252.400 352.276 C 252.400 351.586,252.615 351.200,253.000 351.200 C 253.330 351.200,253.594 351.335,253.587 351.500 M361.500 395.099 C 365.075 395.166,370.925 395.166,374.500 395.099 C 378.075 395.033,375.150 394.979,368.000 394.979 C 360.850 394.979,357.925 395.033,361.500 395.099 M383.500 395.082 C 383.995 395.178,384.805 395.178,385.300 395.082 C 385.795 394.987,385.390 394.909,384.400 394.909 C 383.410 394.909,383.005 394.987,383.500 395.082 ");
				attr(path3, "stroke", "none");
				attr(path3, "fill", "#5a473b");
				attr(path3, "fill-rule", "evenodd");
				add_location(path3, file$6, 11, 65581, 65785);
				attr(path4, "id", "path4");
				attr(path4, "d", "M385.200 22.798 C 384.870 22.991,384.060 23.407,383.400 23.721 C 382.740 24.036,380.580 25.242,378.600 26.402 C 376.620 27.561,374.370 28.865,373.600 29.298 C 372.830 29.731,372.020 30.214,371.800 30.371 C 371.580 30.529,369.960 31.266,368.200 32.010 C 366.440 32.753,363.920 33.945,362.600 34.658 C 357.086 37.638,341.392 41.756,330.855 42.989 C 329.676 43.126,327.696 43.476,326.455 43.766 C 325.215 44.055,322.760 44.605,321.000 44.986 C 319.240 45.368,317.080 45.925,316.200 46.225 C 315.320 46.524,313.880 46.941,313.000 47.151 C 311.325 47.550,304.924 49.834,302.230 50.994 C 301.366 51.365,299.476 52.031,298.030 52.473 C 294.340 53.601,290.722 55.221,287.000 57.412 C 286.120 57.930,284.230 58.935,282.800 59.645 C 281.370 60.355,280.143 61.075,280.074 61.245 C 280.005 61.416,279.330 61.759,278.574 62.009 C 277.818 62.258,277.200 62.628,277.200 62.831 C 277.200 63.034,276.955 63.200,276.655 63.200 C 276.356 63.200,275.084 63.965,273.828 64.900 C 260.384 74.913,256.184 79.037,253.132 85.224 C 251.299 88.938,250.000 91.809,250.000 92.144 C 250.000 92.285,249.685 92.734,249.300 93.142 C 246.031 96.609,244.228 99.038,242.724 102.000 C 242.445 102.550,242.122 103.090,242.007 103.200 C 241.892 103.310,241.272 104.175,240.629 105.123 C 238.397 108.411,235.857 109.546,233.365 108.367 C 232.504 107.960,231.260 107.615,230.600 107.601 C 229.940 107.586,229.051 107.310,228.624 106.987 C 228.196 106.664,227.246 106.400,226.511 106.400 C 225.776 106.400,224.505 106.116,223.687 105.769 C 222.869 105.422,221.390 104.984,220.400 104.797 C 219.410 104.610,217.790 104.192,216.800 103.868 C 212.552 102.477,210.620 102.000,209.254 102.006 C 207.788 102.012,203.383 100.819,200.805 99.718 C 200.038 99.391,198.418 99.022,197.205 98.899 C 195.992 98.776,194.592 98.411,194.093 98.087 C 193.020 97.391,176.058 97.605,173.600 98.345 C 167.608 100.150,152.713 100.046,149.807 98.178 C 149.363 97.893,148.297 97.531,147.437 97.373 C 146.578 97.216,145.408 96.844,144.837 96.546 C 144.267 96.248,143.350 95.998,142.800 95.989 C 142.250 95.980,141.080 95.625,140.200 95.200 C 139.320 94.775,138.325 94.421,137.989 94.414 C 137.653 94.406,136.933 94.085,136.389 93.700 C 133.868 91.915,117.004 93.165,110.563 95.614 C 110.005 95.826,109.032 96.000,108.403 96.000 C 107.773 96.000,107.019 96.230,106.729 96.510 C 106.438 96.791,105.300 97.219,104.200 97.462 C 103.100 97.705,101.660 98.090,101.000 98.319 C 100.340 98.547,98.810 99.048,97.600 99.431 C 96.390 99.814,93.240 101.224,90.600 102.563 C 85.896 104.949,85.735 104.998,82.564 104.994 L 79.328 104.989 77.164 103.040 C 72.612 98.939,72.805 99.000,64.400 99.000 C 56.444 99.000,54.825 99.311,49.416 101.878 C 47.223 102.919,46.820 103.147,43.726 105.099 C 40.377 107.213,37.807 113.290,39.363 115.417 C 39.883 116.128,39.655 116.453,36.434 119.594 C 31.589 124.319,31.301 124.806,32.185 126.766 C 32.994 128.561,32.532 130.000,31.146 130.000 C 29.749 130.000,28.096 132.223,27.187 135.327 C 26.724 136.907,26.068 139.092,25.728 140.181 C 25.388 141.271,25.034 143.251,24.943 144.581 C 24.851 145.912,24.518 148.350,24.203 150.000 C 23.888 151.650,23.460 153.900,23.252 155.000 C 23.043 156.100,22.138 160.420,21.240 164.600 C 20.341 168.780,19.402 173.190,19.152 174.400 C 18.741 176.392,18.037 178.372,17.160 180.000 C 12.467 188.714,12.103 190.610,12.769 202.876 C 13.047 208.004,13.433 213.280,13.626 214.600 C 14.876 223.144,15.166 224.397,16.513 227.054 C 18.105 230.195,22.244 237.238,22.697 237.575 C 23.151 237.912,24.084 239.650,26.957 245.505 C 28.585 248.824,30.279 251.626,31.480 252.987 C 33.093 254.816,33.474 255.566,33.863 257.682 C 34.638 261.900,35.330 263.573,39.127 270.400 C 41.895 275.378,43.297 277.269,47.879 282.200 C 50.121 284.613,56.969 289.699,59.639 290.934 C 62.107 292.077,69.642 294.632,71.600 294.991 C 72.370 295.132,74.170 295.504,75.600 295.817 C 77.030 296.131,80.900 296.761,84.200 297.218 C 87.500 297.674,91.076 298.307,92.146 298.624 C 93.216 298.941,94.573 299.200,95.162 299.200 C 95.750 299.200,97.219 299.457,98.426 299.771 C 102.404 300.808,113.263 301.945,121.800 302.219 C 126.420 302.367,132.990 302.608,136.400 302.754 C 143.716 303.067,151.351 302.667,158.740 301.583 C 164.753 300.701,176.450 300.500,178.803 301.239 C 179.571 301.480,181.460 301.916,183.000 302.208 C 188.768 303.303,195.097 305.228,200.400 307.501 C 205.571 309.717,210.653 313.528,213.606 317.405 C 216.522 321.234,218.226 324.479,219.427 328.491 C 221.412 335.122,224.481 339.961,229.896 345.000 C 237.060 351.666,239.961 354.798,242.552 358.665 C 246.085 363.938,253.888 371.516,258.962 374.600 C 259.685 375.040,260.905 375.940,261.673 376.600 C 263.073 377.805,263.512 378.168,266.812 380.858 C 267.795 381.659,269.500 383.160,270.600 384.192 C 271.700 385.224,274.490 387.716,276.800 389.730 C 279.110 391.745,281.450 393.805,282.000 394.309 C 283.497 395.681,281.087 395.627,335.800 395.510 L 387.000 395.400 387.101 257.000 C 387.187 137.998,387.121 118.327,386.630 116.650 C 386.179 115.111,386.158 114.478,386.529 113.650 C 387.200 112.155,387.424 25.107,386.762 23.508 C 386.270 22.320,386.127 22.255,385.200 22.798 M386.590 27.300 C 387.101 33.741,386.650 109.817,386.097 110.483 C 385.800 110.841,384.630 111.177,383.248 111.302 C 381.957 111.419,380.474 111.785,379.951 112.116 C 379.428 112.446,378.565 112.847,378.034 113.006 C 377.502 113.166,376.617 113.831,376.066 114.486 C 375.516 115.140,374.703 115.809,374.261 115.973 C 373.764 116.157,374.987 116.371,377.461 116.533 C 382.103 116.837,385.595 117.435,386.186 118.026 C 386.470 118.310,386.600 161.937,386.600 256.720 L 386.600 395.000 335.764 395.102 L 284.928 395.203 282.564 393.158 C 281.264 392.033,277.841 388.882,274.957 386.156 C 272.074 383.430,268.834 380.535,267.757 379.722 C 266.681 378.910,265.710 378.142,265.600 378.017 C 265.114 377.463,260.891 374.092,258.597 372.426 C 250.050 366.219,246.305 362.548,242.658 356.800 C 241.080 354.313,238.006 351.055,230.960 344.400 C 225.669 339.403,223.771 336.585,221.934 331.000 C 217.447 317.357,211.329 310.404,200.085 306.163 C 193.801 303.794,186.605 301.600,185.115 301.600 C 184.557 301.600,183.313 301.317,182.350 300.972 C 176.821 298.986,169.055 298.828,158.200 300.478 C 149.481 301.804,141.944 302.155,133.600 301.622 C 129.530 301.362,122.203 300.990,117.318 300.796 C 109.510 300.485,96.819 298.943,95.519 298.148 C 95.028 297.848,82.281 295.600,81.068 295.600 C 79.518 295.600,73.463 294.484,71.146 293.771 C 70.127 293.457,68.996 293.200,68.634 293.200 C 67.912 293.200,64.419 291.818,60.451 289.962 C 52.646 286.312,42.837 276.111,38.950 267.600 C 38.598 266.830,38.177 266.110,38.015 266.000 C 37.486 265.641,35.675 260.676,34.801 257.190 C 34.079 254.308,33.670 253.471,32.160 251.790 C 30.497 249.936,29.085 247.404,26.700 241.994 C 26.165 240.780,24.708 238.225,23.463 236.315 C 22.219 234.405,21.200 232.694,21.200 232.514 C 21.200 232.333,20.765 231.545,20.232 230.762 C 15.670 224.048,14.056 215.687,13.908 198.000 C 13.837 189.574,14.177 187.851,16.809 183.272 C 19.009 179.443,20.866 173.856,21.417 169.400 C 21.553 168.300,22.033 166.050,22.482 164.400 C 23.321 161.323,24.115 157.992,24.774 154.784 C 24.980 153.785,25.437 150.470,25.791 147.417 C 26.374 142.384,26.976 139.594,28.463 135.037 C 29.045 133.254,30.785 131.328,32.755 130.289 C 34.053 129.605,34.092 129.516,33.806 127.889 C 33.238 124.644,33.385 124.015,35.076 122.459 C 35.949 121.657,36.977 120.516,37.361 119.925 C 37.768 119.298,38.588 118.739,39.329 118.582 C 42.177 117.980,42.855 116.594,41.165 114.826 C 36.449 109.891,49.147 100.789,62.103 99.817 C 68.905 99.308,72.610 100.268,75.972 103.412 C 76.987 104.362,78.354 105.270,79.009 105.431 C 79.664 105.591,80.629 106.055,81.154 106.461 C 82.394 107.422,84.295 107.397,85.800 106.400 C 86.460 105.963,87.455 105.604,88.011 105.603 C 88.567 105.601,89.330 105.240,89.707 104.800 C 90.084 104.360,90.844 104.000,91.396 104.000 C 91.948 104.000,92.400 103.816,92.400 103.591 C 92.400 103.367,92.895 102.965,93.500 102.700 C 94.105 102.434,94.744 101.988,94.920 101.708 C 95.096 101.429,95.728 101.200,96.326 101.200 C 96.923 101.200,98.084 100.840,98.904 100.400 C 99.725 99.960,100.659 99.600,100.979 99.600 C 101.300 99.600,103.145 99.046,105.081 98.368 C 107.016 97.691,109.770 96.912,111.200 96.638 C 112.630 96.364,114.430 95.942,115.200 95.700 C 115.970 95.459,117.770 95.071,119.200 94.839 C 120.630 94.607,122.610 94.242,123.600 94.026 C 126.435 93.410,133.072 93.504,134.540 94.182 C 137.143 95.384,140.295 96.371,146.000 97.768 C 147.210 98.065,149.460 98.796,151.000 99.392 C 155.567 101.162,169.783 101.958,171.912 100.564 C 172.513 100.169,174.389 99.791,176.756 99.585 C 178.880 99.400,181.120 99.058,181.735 98.825 C 183.405 98.190,191.093 98.302,193.000 98.988 C 193.880 99.305,195.284 99.573,196.120 99.582 C 196.956 99.592,198.132 99.855,198.734 100.166 C 199.335 100.477,200.541 100.864,201.414 101.026 C 202.286 101.188,203.360 101.551,203.800 101.832 C 204.240 102.114,205.909 102.470,207.509 102.625 C 209.109 102.779,210.507 103.049,210.615 103.225 C 210.724 103.400,211.845 103.666,213.106 103.814 C 214.368 103.963,215.760 104.309,216.200 104.584 C 216.640 104.858,217.885 105.215,218.967 105.376 C 220.048 105.537,221.308 105.903,221.767 106.189 C 222.225 106.474,223.533 106.823,224.674 106.964 C 225.815 107.105,227.255 107.485,227.874 107.808 C 228.493 108.131,229.561 108.396,230.246 108.398 C 230.931 108.399,231.971 108.776,232.555 109.236 C 235.073 111.217,240.226 108.583,242.408 104.200 C 244.264 100.472,246.593 97.111,249.457 94.024 C 250.160 93.268,251.135 91.738,251.626 90.624 C 253.255 86.926,253.600 86.082,253.600 85.797 C 253.600 85.642,254.320 84.610,255.200 83.505 C 256.080 82.400,256.800 81.378,256.800 81.235 C 256.800 79.155,274.868 64.624,281.794 61.134 C 284.559 59.740,288.122 57.933,289.711 57.118 C 291.300 56.303,293.590 55.333,294.800 54.962 C 296.010 54.591,298.710 53.581,300.800 52.718 C 308.339 49.603,317.508 46.890,326.800 45.025 C 328.670 44.650,330.830 44.186,331.600 43.994 C 332.370 43.803,334.170 43.531,335.600 43.390 C 337.030 43.249,339.100 42.897,340.200 42.607 C 341.300 42.317,343.100 41.959,344.200 41.813 C 353.043 40.633,366.271 35.008,383.800 24.975 C 386.229 23.585,386.300 23.644,386.590 27.300 M333.600 132.661 C 332.168 133.132,330.903 133.859,329.544 134.989 C 328.742 135.655,327.616 136.593,327.041 137.072 C 326.465 137.552,324.984 138.423,323.749 139.007 C 322.138 139.769,321.382 140.393,321.071 141.217 C 320.830 141.856,320.288 142.418,319.850 142.483 C 318.277 142.717,318.664 143.600,320.341 143.600 C 322.584 143.600,324.000 142.989,324.000 142.020 C 324.000 141.092,325.363 140.298,328.890 139.171 C 331.454 138.352,336.800 134.459,336.800 133.411 C 336.800 133.105,337.205 132.778,337.700 132.682 C 338.195 132.587,337.610 132.499,336.400 132.486 C 335.190 132.473,333.930 132.552,333.600 132.661 M316.550 143.876 C 316.082 143.968,315.286 144.483,314.780 145.021 C 314.274 145.560,313.458 146.000,312.966 146.000 C 312.474 146.000,310.931 146.540,309.536 147.200 C 308.141 147.860,306.769 148.400,306.487 148.400 C 306.205 148.400,305.823 148.805,305.639 149.300 C 305.185 150.517,308.166 151.076,310.318 150.177 C 311.077 149.860,312.101 149.600,312.594 149.600 C 313.087 149.600,314.139 149.105,314.931 148.500 C 315.724 147.895,316.829 147.077,317.386 146.681 C 318.080 146.189,318.400 145.590,318.400 144.781 C 318.400 143.598,318.275 143.537,316.550 143.876 M308.201 208.796 C 307.732 210.275,308.518 210.787,309.808 209.843 C 310.455 209.370,310.490 209.190,310.036 208.643 C 309.309 207.768,308.506 207.835,308.201 208.796 ");
				attr(path4, "stroke", "none");
				attr(path4, "fill", "#a3a5a5");
				attr(path4, "fill-rule", "evenodd");
				add_location(path4, file$6, 11, 119744, 119948);
				attr(g0, "id", "svgg");
				add_location(g0, file$6, 11, 157, 361);
				attr(svg, "id", "svg");
				attr(svg, "xmlns", "http://www.w3.org/2000/svg");
				attr(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
				attr(svg, "width", "100");
				attr(svg, "height", "100");
				attr(svg, "viewBox", "0, 0, 400,405.9259259259259");
				add_location(svg, file$6, 11, 2, 206);
				attr(g1, "class", "cannon svelte-r8lgo8");
				attr(g1, "transform", g1_transform_value = `translate(236, 700) rotate(${ctx.$angle})`);
				add_location(g1, file$6, 10, 0, 133);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, g1, anchor);
				append(g1, svg);
				append(svg, g0);
				append(g0, path0);
				append(g0, path1);
				append(g0, path2);
				append(g0, path3);
				append(g0, path4);
			},

			p: function update(changed, ctx) {
				if ((changed.$angle) && g1_transform_value !== (g1_transform_value = `translate(236, 700) rotate(${ctx.$angle})`)) {
					attr(g1, "transform", g1_transform_value);
				}
			},

			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(g1);
				}
			}
		};
	}

	function instance$3($$self, $$props, $$invalidate) {
		let $angle;

		validate_store(angle, 'angle');
		subscribe($$self, angle, $$value => { $angle = $$value; $$invalidate('$angle', $angle); });

		return { $angle };
	}

	class Cannon extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$3, create_fragment$6, safe_not_equal, []);
		}
	}

	/*
	Adapted from https://github.com/mattdesl
	Distributed under MIT License https://github.com/mattdesl/eases/blob/master/LICENSE.md
	*/

	function cubicOut(t) {
		const f = t - 1.0;
		return f * f * f + 1.0;
	}

	function fade(node, {
		delay = 0,
		duration = 400
	}) {
		const o = +getComputedStyle(node).opacity;

		return {
			delay,
			duration,
			css: t => `opacity: ${t * o}`
		};
	}

	function fly(node, {
		delay = 0,
		duration = 400,
		easing = cubicOut,
		x = 0,
		y = 0,
		opacity = 0
	}) {
		const style = getComputedStyle(node);
		const target_opacity = +style.opacity;
		const transform = style.transform === 'none' ? '' : style.transform;

		const od = target_opacity * (1 - opacity);

		return {
			delay,
			duration,
			easing,
			css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
		};
	}

	/* src/components/Enemy.svelte generated by Svelte v3.4.1 */

	const file$7 = "src/components/Enemy.svelte";

	function create_fragment$7(ctx) {
		var g1, svg, g0, path0, path1, path2, path3, path4, g1_transform_value, g1_outro, current;

		return {
			c: function create() {
				g1 = svg_element("g");
				svg = svg_element("svg");
				g0 = svg_element("g");
				path0 = svg_element("path");
				path1 = svg_element("path");
				path2 = svg_element("path");
				path3 = svg_element("path");
				path4 = svg_element("path");
				attr(path0, "id", "path0");
				attr(path0, "d", "M131.866 0.697 C 131.522 1.076,130.299 1.506,128.844 1.759 C 127.500 1.993,126.160 2.394,125.867 2.650 C 125.573 2.906,124.933 3.231,124.444 3.372 C 123.001 3.787,119.699 5.441,118.960 6.119 C 118.583 6.465,118.023 6.833,117.715 6.937 C 117.407 7.041,116.791 7.643,116.344 8.274 C 115.898 8.906,115.018 10.118,114.389 10.969 C 111.491 14.884,110.579 16.198,110.578 16.459 C 110.578 16.801,109.417 18.475,107.692 20.622 C 106.985 21.502,106.285 22.622,106.136 23.111 C 105.775 24.294,104.275 26.854,103.628 27.391 C 103.344 27.627,103.111 28.099,103.111 28.440 C 103.111 28.781,102.791 29.466,102.400 29.964 C 102.009 30.461,101.689 31.169,101.689 31.536 C 101.689 31.904,101.369 32.833,100.977 33.601 C 98.033 39.376,97.484 48.504,99.965 50.455 C 100.478 50.858,101.004 51.612,101.134 52.129 C 101.264 52.646,101.762 53.646,102.240 54.350 C 102.902 55.324,103.111 56.099,103.111 57.574 C 103.111 59.209,103.266 59.679,104.089 60.538 C 104.962 61.451,105.067 61.821,105.067 64.013 C 105.067 66.043,105.198 66.598,105.825 67.226 L 106.583 67.985 108.073 66.639 C 108.892 65.899,109.876 64.722,110.259 64.024 C 112.253 60.388,112.804 59.528,114.036 58.127 C 114.774 57.287,116.017 55.721,116.799 54.647 C 119.033 51.576,121.379 50.453,125.492 50.486 C 126.916 50.497,128.856 48.394,128.145 47.608 C 127.345 46.724,128.002 45.701,129.914 44.855 C 131.182 44.294,131.637 43.816,132.416 42.224 C 133.790 39.414,135.187 38.159,136.349 38.688 C 137.653 39.282,137.358 41.956,135.987 41.956 C 134.839 41.956,135.560 42.586,136.916 42.767 C 138.508 42.981,139.733 43.865,139.733 44.800 C 139.733 45.130,140.043 45.681,140.421 46.023 C 141.142 46.675,140.878 48.019,139.859 48.889 C 139.630 49.084,139.085 50.092,138.648 51.127 L 137.854 53.011 138.749 53.972 C 139.415 54.688,139.694 55.463,139.844 57.011 C 139.976 58.384,140.251 59.240,140.652 59.533 C 141.255 59.974,141.253 60.075,140.597 62.668 C 140.302 63.838,141.683 66.893,142.386 66.623 C 143.212 66.306,144.413 66.722,145.566 67.724 C 146.135 68.218,146.855 68.627,147.166 68.634 C 147.478 68.640,148.044 68.880,148.424 69.167 C 149.737 70.160,152.178 69.424,152.178 68.035 C 152.178 67.555,154.940 65.778,155.686 65.778 C 156.016 65.778,157.508 65.153,159.002 64.389 C 160.495 63.625,162.090 62.887,162.547 62.748 C 163.004 62.609,163.698 62.130,164.089 61.685 C 165.103 60.530,166.496 60.298,167.505 61.115 L 168.327 61.781 167.420 62.979 C 166.921 63.639,165.687 65.789,164.678 67.758 C 162.179 72.638,162.215 73.392,164.885 71.973 C 166.535 71.096,167.467 71.242,167.467 72.378 C 167.467 73.902,168.921 73.190,171.860 70.227 C 173.245 68.831,174.077 68.267,174.749 68.267 C 175.481 68.267,175.651 68.127,175.508 67.644 C 174.935 65.717,174.879 65.067,175.284 65.067 C 175.519 65.067,175.795 65.387,175.897 65.778 C 176.106 66.579,176.756 66.680,177.867 66.085 C 178.511 65.741,178.741 65.822,179.444 66.639 C 180.580 67.959,180.506 68.622,179.222 68.622 C 178.292 68.622,178.055 68.872,177.052 70.910 C 176.433 72.168,175.703 73.283,175.430 73.387 C 175.157 73.492,174.933 73.868,174.933 74.223 C 174.933 75.007,173.883 76.416,171.668 78.602 C 170.004 80.245,170.002 80.248,170.459 81.575 L 170.916 82.904 174.080 82.994 C 177.500 83.091,179.877 83.941,180.623 85.334 C 181.125 86.273,181.672 86.230,182.946 85.151 C 184.378 83.938,189.363 80.711,189.806 80.711 C 190.002 80.711,190.216 80.580,190.281 80.419 C 190.347 80.259,190.967 79.739,191.660 79.264 C 198.110 74.841,203.127 69.718,204.053 66.611 C 204.851 63.930,205.024 60.494,204.446 58.809 C 204.252 58.242,203.865 55.858,203.586 53.511 C 202.982 48.422,201.103 41.192,199.817 39.008 C 199.611 38.658,199.287 37.538,199.096 36.519 C 198.905 35.500,198.407 33.947,197.989 33.067 C 197.572 32.187,196.893 30.760,196.482 29.896 C 195.733 28.324,175.721 7.822,174.935 7.822 C 174.739 7.822,174.578 7.593,174.578 7.313 C 174.578 7.033,174.288 6.711,173.933 6.599 C 173.578 6.486,172.686 5.842,171.949 5.168 C 171.213 4.493,170.263 3.836,169.838 3.707 C 169.414 3.579,168.747 3.192,168.356 2.848 C 167.964 2.503,166.784 2.021,165.732 1.776 C 164.397 1.464,163.768 1.129,163.646 0.665 C 163.382 -0.345,132.783 -0.315,131.866 0.697 M147.435 43.576 C 147.552 43.881,147.400 44.759,147.098 45.529 C 146.784 46.327,146.688 47.015,146.874 47.129 C 147.053 47.240,147.200 47.559,147.200 47.837 C 147.200 48.418,144.894 50.909,144.614 50.629 C 144.218 50.233,144.706 43.601,145.152 43.318 C 145.902 42.841,147.210 42.989,147.435 43.576 M151.379 45.994 C 151.666 46.625,151.640 47.042,151.273 47.683 C 151.005 48.150,150.623 48.893,150.424 49.333 C 150.014 50.241,148.978 50.419,148.978 49.582 C 148.978 49.279,148.738 48.567,148.444 48.000 C 147.661 46.485,148.326 45.156,149.867 45.156 C 150.709 45.156,151.094 45.369,151.379 45.994 M163.556 49.778 C 163.556 49.973,163.329 50.133,163.051 50.133 C 162.774 50.133,162.294 50.230,161.985 50.349 C 161.675 50.468,161.422 50.400,161.422 50.197 C 161.422 49.852,162.100 49.557,163.111 49.463 C 163.356 49.441,163.556 49.582,163.556 49.778 M153.121 51.603 C 152.651 51.877,152.354 51.874,152.072 51.592 C 151.786 51.306,151.964 51.203,152.729 51.211 C 153.648 51.220,153.697 51.269,153.121 51.603 M160.709 51.644 C 160.708 51.889,160.468 52.547,160.176 53.107 C 159.883 53.667,159.644 54.570,159.644 55.114 C 159.644 56.467,158.730 56.741,157.988 55.609 C 157.360 54.650,156.170 54.652,155.022 55.614 C 154.729 55.859,153.996 56.255,153.393 56.493 C 152.079 57.012,148.622 60.473,148.622 61.270 C 148.622 62.360,147.799 63.644,147.099 63.644 C 146.524 63.644,146.478 63.552,146.838 63.119 C 147.162 62.729,147.178 62.315,146.900 61.519 C 146.694 60.928,146.647 60.444,146.795 60.444 C 146.943 60.444,147.534 59.801,148.110 59.014 C 148.685 58.228,149.636 57.342,150.222 57.047 C 150.809 56.752,151.849 55.767,152.533 54.859 C 154.356 52.441,154.589 52.267,156.025 52.261 C 156.745 52.259,157.733 52.034,158.222 51.763 C 159.357 51.133,160.712 51.069,160.709 51.644 M141.763 57.329 C 141.678 57.771,141.605 57.493,141.601 56.711 C 141.597 55.929,141.666 55.567,141.755 55.907 C 141.844 56.247,141.848 56.887,141.763 57.329 M105.436 57.268 C 105.768 57.804,105.259 60.248,104.895 59.869 C 104.610 59.572,104.409 58.298,104.494 57.333 C 104.542 56.790,105.117 56.750,105.436 57.268 M172.949 63.505 C 173.924 63.879,173.661 65.422,172.622 65.422 C 171.928 65.422,171.733 65.240,171.733 64.593 C 171.733 63.408,172.022 63.149,172.949 63.505 M153.482 65.572 C 153.364 65.881,152.951 66.133,152.565 66.133 C 152.180 66.133,151.765 66.293,151.644 66.489 C 151.255 67.119,150.405 66.895,150.633 66.222 C 151.041 65.015,152.638 63.952,153.200 64.514 C 153.473 64.788,153.600 65.264,153.482 65.572 M135.103 73.788 C 134.222 74.849,136.992 77.369,138.437 76.820 C 140.663 75.973,141.021 74.482,139.111 74.006 C 136.309 73.307,135.537 73.265,135.103 73.788 M179.556 78.895 C 179.556 79.331,178.554 79.682,178.332 79.323 C 178.233 79.163,178.255 78.930,178.380 78.805 C 178.719 78.466,179.556 78.530,179.556 78.895 M377.244 85.333 C 376.793 85.724,376.066 86.044,375.627 86.044 C 374.632 86.044,372.622 88.261,372.622 89.358 C 372.622 90.219,374.655 91.716,375.063 91.155 C 376.354 89.380,379.004 88.715,380.472 89.798 C 384.286 92.612,383.965 95.372,379.392 99.088 C 376.522 101.421,375.115 104.028,376.196 105.011 C 377.496 106.193,384.594 100.611,385.845 97.422 C 387.272 93.785,384.528 86.056,381.805 86.042 C 381.546 86.041,380.853 85.722,380.267 85.333 C 378.919 84.441,378.273 84.441,377.244 85.333 M205.333 85.454 C 204.942 85.681,204.517 86.012,204.389 86.189 C 203.861 86.918,204.270 112.383,204.815 112.728 C 205.103 112.910,210.345 113.058,216.584 113.061 L 227.834 113.067 228.017 112.267 C 228.698 109.288,228.242 86.405,227.487 85.701 C 225.313 83.676,224.605 86.392,225.071 94.970 C 225.224 97.785,225.261 101.907,225.153 104.130 L 224.957 108.171 223.779 108.663 C 222.249 109.302,220.313 109.290,219.041 108.632 C 217.753 107.966,217.709 107.516,217.751 95.533 C 217.786 85.672,217.654 84.939,215.963 85.565 C 214.801 85.995,214.767 86.332,214.761 97.290 C 214.755 109.691,214.961 108.998,211.300 108.944 C 207.752 108.892,207.886 109.259,207.588 98.753 C 207.226 86.038,206.967 84.506,205.333 85.454 M165.880 88.156 C 164.414 90.528,168.397 92.975,170.159 90.785 C 171.139 89.566,170.811 89.100,168.978 89.108 C 168.092 89.112,167.488 88.897,167.180 88.468 C 166.668 87.757,166.197 87.644,165.880 88.156 M343.073 93.641 L 342.222 94.065 342.120 106.855 C 342.004 121.246,342.049 121.811,343.350 122.404 C 345.090 123.196,346.014 121.484,345.894 117.692 C 345.772 113.869,345.979 113.557,348.775 113.355 C 351.200 113.180,353.313 111.979,353.662 110.578 C 353.784 110.089,354.281 108.920,354.768 107.979 C 357.783 102.149,352.615 91.634,347.929 94.065 C 346.667 94.720,345.278 94.723,345.028 94.072 C 344.740 93.321,344.030 93.164,343.073 93.641 M237.081 94.399 C 236.361 94.888,235.608 95.289,235.409 95.289 C 235.210 95.289,234.858 95.649,234.626 96.089 C 234.394 96.529,234.108 96.969,233.991 97.067 C 233.873 97.164,233.544 97.724,233.259 98.311 C 232.975 98.898,232.521 99.646,232.250 99.974 C 231.668 100.680,231.268 105.527,231.606 107.779 C 231.829 109.266,232.483 110.182,234.913 112.412 C 237.371 114.668,245.333 112.360,245.333 109.392 C 245.333 109.195,245.560 108.781,245.836 108.472 C 247.953 106.108,247.555 95.644,245.348 95.644 C 245.174 95.644,244.580 95.268,244.027 94.808 C 242.395 93.450,238.790 93.237,237.081 94.399 M300.378 93.961 C 299.100 94.434,296.566 96.682,295.945 97.895 C 295.627 98.515,295.190 99.136,294.973 99.276 C 294.273 99.726,294.448 109.610,295.168 110.330 C 295.493 110.655,295.813 111.043,295.879 111.194 C 296.746 113.155,300.023 113.919,303.097 112.875 C 304.271 112.477,304.895 112.429,305.397 112.698 C 308.030 114.107,308.894 111.735,307.245 107.621 C 306.666 106.175,306.749 99.241,307.358 98.139 C 308.578 95.935,303.407 92.840,300.378 93.961 M314.667 93.747 C 310.719 93.927,310.400 94.044,310.400 95.319 C 310.400 97.033,310.976 97.778,312.300 97.778 C 314.736 97.778,314.824 98.027,315.022 105.482 C 315.206 112.417,315.327 113.067,316.436 113.067 C 318.234 113.067,318.222 113.117,318.222 105.553 L 318.222 98.471 319.134 98.125 C 319.636 97.934,320.461 97.778,320.967 97.778 C 321.474 97.778,322.406 97.383,323.039 96.901 L 324.189 96.023 324.985 98.153 C 325.423 99.324,325.920 100.368,326.091 100.473 C 326.261 100.578,326.400 100.951,326.400 101.301 C 326.400 101.652,326.800 102.691,327.289 103.610 C 327.778 104.530,328.178 105.520,328.178 105.811 C 328.178 106.102,328.538 106.827,328.978 107.423 C 330.114 108.962,330.113 112.673,328.977 114.598 C 328.537 115.343,328.178 116.348,328.178 116.832 C 328.178 117.316,327.938 118.286,327.644 118.988 C 326.937 120.680,326.972 121.364,327.802 122.115 C 329.089 123.280,330.397 122.441,330.862 120.151 C 331.078 119.090,331.522 117.710,331.849 117.084 C 332.177 116.458,332.444 115.576,332.444 115.124 C 332.444 114.671,332.764 113.704,333.156 112.974 C 333.547 112.244,333.867 111.444,333.867 111.196 C 333.867 110.948,334.165 110.187,334.530 109.506 C 334.895 108.824,335.311 107.707,335.454 107.022 C 335.597 106.338,335.914 105.458,336.159 105.067 C 336.403 104.676,336.810 103.716,337.063 102.933 C 337.316 102.151,337.741 101.196,338.006 100.810 C 338.272 100.424,338.496 99.784,338.504 99.388 C 338.513 98.991,338.743 98.040,339.016 97.274 C 339.557 95.756,338.998 93.867,338.008 93.867 C 337.298 93.867,336.135 95.319,335.662 96.795 C 335.428 97.526,335.107 98.204,334.948 98.302 C 334.789 98.401,334.548 99.083,334.413 99.818 C 334.137 101.322,332.174 104.628,331.723 104.349 C 331.562 104.249,331.238 103.570,331.003 102.839 C 330.769 102.109,330.369 101.271,330.116 100.978 C 329.863 100.684,329.539 99.964,329.396 99.378 C 329.253 98.791,328.840 97.930,328.479 97.463 C 328.118 96.997,327.822 96.345,327.822 96.014 C 327.822 94.377,325.536 93.388,324.913 94.756 C 324.410 95.861,324.150 95.866,323.126 94.790 C 322.214 93.833,319.669 93.520,314.667 93.747 M263.172 94.690 C 262.390 95.524,261.887 110.629,262.582 112.423 C 263.563 114.952,272.737 112.646,274.044 109.542 C 274.639 108.129,274.230 105.623,273.223 104.510 C 272.554 103.770,272.566 101.896,273.244 101.333 C 274.650 100.167,273.153 96.586,270.565 94.925 C 268.334 93.494,264.414 93.369,263.172 94.690 M277.866 94.580 C 277.519 95.672,277.403 111.357,277.735 112.267 C 277.946 112.845,278.312 113.067,279.058 113.067 C 280.208 113.067,280.533 112.241,280.533 109.326 C 280.533 107.020,282.274 105.600,285.100 105.600 C 288.113 105.600,288.319 105.864,288.435 109.867 C 288.524 112.939,288.598 113.254,289.247 113.347 C 291.109 113.614,291.190 113.222,291.216 103.814 C 291.243 93.955,291.215 93.783,289.644 93.936 L 288.533 94.044 288.431 97.328 C 288.312 101.152,288.449 101.007,284.305 101.696 C 280.774 102.283,280.536 102.059,280.528 98.154 C 280.522 94.456,280.325 93.867,279.094 93.867 C 278.403 93.867,278.022 94.088,277.866 94.580 M360.889 94.955 C 360.009 95.547,359.129 96.401,358.933 96.853 C 358.738 97.304,358.402 97.898,358.186 98.170 C 356.676 100.085,356.845 107.664,358.448 109.877 C 361.646 114.291,369.705 114.810,369.349 110.578 L 369.244 109.333 365.947 109.150 C 362.815 108.976,362.605 108.913,361.782 107.906 C 360.525 106.368,360.666 106.056,362.836 105.571 C 365.302 105.019,366.312 104.143,365.997 102.828 C 365.697 101.575,365.894 101.689,363.428 101.340 C 360.507 100.928,360.369 100.790,361.481 99.397 C 362.722 97.841,364.725 97.497,366.678 98.506 C 368.435 99.413,368.870 99.382,369.357 98.313 C 369.846 97.240,369.378 95.736,368.450 95.397 C 368.105 95.271,367.441 94.875,366.974 94.517 C 365.583 93.449,362.835 93.647,360.889 94.955 M100.368 96.533 C 100.371 97.511,100.440 97.869,100.522 97.328 C 100.604 96.788,100.601 95.988,100.517 95.551 C 100.433 95.113,100.366 95.556,100.368 96.533 M268.775 97.587 C 271.639 99.068,269.538 102.361,266.489 101.169 C 265.048 100.606,264.767 98.508,266.015 97.634 C 267.016 96.933,267.494 96.925,268.775 97.587 M242.031 98.151 C 244.825 99.125,244.322 106.516,241.319 108.619 C 237.749 111.120,232.334 105.657,235.372 102.620 C 235.571 102.421,235.733 101.890,235.733 101.441 C 235.733 99.147,239.397 97.233,242.031 98.151 M303.842 103.405 C 303.818 108.891,303.685 109.156,300.947 109.156 C 295.607 109.156,296.110 99.340,301.511 98.162 C 303.658 97.694,303.865 98.160,303.842 103.405 M351.550 100.089 C 352.398 103.020,352.493 104.750,351.856 105.659 C 351.544 106.105,351.289 106.822,351.289 107.254 C 351.289 109.013,347.485 110.037,346.292 108.599 C 345.772 107.973,345.582 102.643,346.008 100.640 C 346.674 97.503,350.687 97.104,351.550 100.089 M100.386 102.044 C 100.386 103.511,100.449 104.111,100.526 103.378 C 100.602 102.644,100.602 101.444,100.526 100.711 C 100.449 99.978,100.386 100.578,100.386 102.044 M92.444 105.424 C 92.028 106.519,92.023 107.630,92.431 108.622 C 92.802 109.525,93.033 108.954,93.262 106.572 C 93.446 104.663,92.981 104.011,92.444 105.424 M269.292 105.584 C 270.954 106.216,271.943 109.156,270.493 109.156 C 270.277 109.156,269.837 109.394,269.516 109.685 C 267.585 111.432,265.144 110.328,265.180 107.724 C 265.212 105.446,266.780 104.629,269.292 105.584 M376.068 108.356 C 374.675 110.798,375.151 113.067,377.058 113.067 L 378.311 113.067 378.311 111.137 C 378.311 108.859,376.828 107.021,376.068 108.356 M91.050 112.401 C 91.080 114.816,91.166 114.824,91.682 112.455 C 91.934 111.299,91.895 110.860,91.515 110.544 C 91.103 110.202,91.027 110.507,91.050 112.401 M254.486 111.553 C 253.247 111.839,251.364 116.463,251.872 117.970 C 252.303 119.252,254.578 118.210,254.578 116.731 C 254.578 116.474,254.898 115.667,255.289 114.937 C 256.363 112.933,255.955 111.214,254.486 111.553 M89.532 116.213 C 89.353 117.431,89.545 118.120,89.986 117.848 C 90.403 117.590,90.411 115.659,89.995 115.402 C 89.822 115.295,89.613 115.660,89.532 116.213 M155.798 128.267 C 154.812 129.215,152.960 130.489,152.568 130.489 C 152.376 130.489,152.002 130.798,151.738 131.175 C 151.473 131.552,150.803 131.975,150.249 132.114 C 149.694 132.253,149.163 132.664,149.068 133.028 C 148.973 133.391,148.786 133.689,148.653 133.689 C 148.520 133.689,148.099 133.927,147.717 134.219 C 147.335 134.510,146.142 135.331,145.067 136.044 C 143.991 136.756,142.673 137.806,142.138 138.375 C 141.603 138.945,140.683 139.580,140.094 139.785 C 139.504 139.990,139.022 140.376,139.022 140.641 C 139.022 140.911,138.475 141.226,137.781 141.356 C 137.098 141.484,136.637 141.747,136.756 141.940 C 137.182 142.629,142.132 141.349,142.865 140.360 C 143.120 140.015,143.555 139.733,143.830 139.733 C 144.106 139.733,144.796 139.293,145.364 138.756 C 150.458 133.933,151.822 132.561,151.822 132.260 C 151.822 132.068,152.069 131.911,152.372 131.911 C 152.674 131.911,153.321 131.511,153.810 131.022 C 154.299 130.533,154.823 130.133,154.974 130.133 C 155.326 130.133,157.511 128.192,157.511 127.879 C 157.511 127.414,156.431 127.658,155.798 128.267 M36.269 140.356 C 36.270 140.893,36.511 141.794,36.804 142.356 C 37.098 142.919,37.305 143.803,37.266 144.322 C 37.163 145.675,37.580 146.216,38.392 145.782 C 38.756 145.587,39.531 145.524,40.116 145.641 C 40.972 145.812,41.260 145.701,41.597 145.071 C 42.261 143.832,41.759 142.592,40.491 142.338 C 39.539 142.148,39.419 141.995,39.546 141.132 C 39.706 140.044,38.792 139.378,37.139 139.378 C 36.424 139.378,36.267 139.554,36.269 140.356 M126.151 141.938 C 126.483 142.270,126.673 142.270,127.004 141.938 C 127.336 141.606,127.241 141.511,126.578 141.511 C 125.914 141.511,125.819 141.606,126.151 141.938 M129.422 143.289 C 129.422 143.484,130.072 143.644,130.865 143.644 C 131.737 143.644,132.222 143.504,132.089 143.289 C 131.968 143.093,131.319 142.933,130.646 142.933 C 129.973 142.933,129.422 143.093,129.422 143.289 M141.738 147.447 C 141.314 147.872,141.509 148.622,142.044 148.622 C 142.338 148.622,142.578 148.392,142.578 148.110 C 142.578 147.516,142.070 147.115,141.738 147.447 M143.476 150.386 C 143.207 150.821,144.041 152.178,144.577 152.178 C 145.036 152.178,145.384 151.163,145.157 150.489 C 144.981 149.966,143.780 149.892,143.476 150.386 M141.585 153.313 C 140.848 154.049,141.071 156.043,141.986 156.906 C 142.443 157.337,142.998 158.009,143.220 158.400 C 143.785 159.397,143.798 157.750,143.242 155.446 C 142.750 153.402,142.201 152.696,141.585 153.313 M83.011 157.244 C 82.920 157.489,82.595 159.369,82.291 161.422 C 81.217 168.661,81.200 167.992,82.478 168.936 C 83.105 169.399,83.998 170.582,84.464 171.565 C 84.929 172.547,85.644 173.711,86.054 174.150 C 86.463 174.590,86.977 175.463,87.196 176.091 C 87.415 176.720,87.892 177.553,88.255 177.943 C 88.619 178.333,89.015 179.056,89.135 179.548 C 89.255 180.041,89.889 181.478,90.543 182.742 C 91.198 184.005,91.733 185.223,91.733 185.449 C 91.733 185.675,92.031 186.241,92.396 186.708 C 92.760 187.174,93.176 187.956,93.321 188.444 C 93.467 188.933,94.206 190.613,94.966 192.178 C 95.725 193.742,96.453 195.582,96.584 196.267 C 96.714 196.951,97.363 198.631,98.026 200.000 C 99.097 202.212,99.991 204.953,101.015 209.164 C 101.194 209.901,101.659 211.099,102.048 211.825 C 102.437 212.551,102.756 213.672,102.756 214.315 C 102.756 214.959,103.065 216.721,103.444 218.232 C 103.822 219.742,104.236 222.178,104.364 223.644 C 104.491 225.111,104.816 227.111,105.085 228.089 C 105.354 229.067,105.748 232.907,105.959 236.622 C 106.170 240.338,106.418 243.598,106.511 243.867 C 106.756 244.580,109.543 244.073,110.222 243.191 C 111.182 241.945,113.931 241.711,116.428 242.661 C 121.832 244.718,124.127 244.764,130.076 242.935 C 131.761 242.418,132.520 242.401,136.831 242.792 C 143.406 243.387,142.804 244.384,143.806 231.231 C 144.076 227.679,144.478 224.436,144.698 224.025 C 144.918 223.613,145.188 221.079,145.297 218.394 C 145.406 215.708,145.719 212.608,145.992 211.504 C 146.265 210.400,146.488 208.800,146.487 207.949 C 146.485 207.097,146.643 205.200,146.836 203.733 C 147.030 202.267,147.528 198.507,147.943 195.378 C 148.358 192.249,148.918 189.209,149.187 188.622 C 149.718 187.463,150.382 183.391,150.393 181.225 C 150.397 180.481,150.721 179.169,151.112 178.309 C 151.755 176.897,152.284 173.660,152.766 168.178 C 152.922 166.397,152.826 166.051,151.686 164.305 C 150.998 163.251,150.334 161.933,150.212 161.376 C 149.886 159.893,149.472 159.834,148.335 161.106 C 147.388 162.166,147.174 162.239,145.177 162.179 C 143.596 162.132,142.913 162.263,142.567 162.679 C 142.309 162.990,140.402 164.194,138.329 165.355 C 136.255 166.516,134.077 167.906,133.488 168.444 C 132.109 169.703,127.741 172.913,126.537 173.551 C 126.025 173.822,124.754 174.503,123.712 175.063 C 120.258 176.920,111.644 174.043,111.644 171.032 C 111.644 170.850,111.095 170.548,110.423 170.363 C 109.225 170.032,106.667 167.834,106.667 167.135 C 106.667 166.940,106.347 166.609,105.956 166.400 C 105.564 166.191,105.244 165.792,105.244 165.515 C 105.244 164.755,103.536 163.200,102.702 163.200 C 102.299 163.200,101.654 162.800,101.270 162.311 C 100.815 161.733,100.215 161.422,99.554 161.422 C 98.849 161.422,98.468 161.204,98.311 160.711 C 98.161 160.239,97.765 159.995,97.132 159.984 C 96.607 159.976,95.538 159.724,94.756 159.424 C 91.387 158.135,83.244 156.623,83.011 157.244 M224.217 160.861 C 223.802 162.512,224.409 163.186,225.539 162.329 C 226.153 161.863,226.156 161.787,225.587 160.918 C 224.837 159.774,224.493 159.759,224.217 160.861 M24.612 162.103 C 23.495 163.614,23.604 163.791,25.511 163.572 C 27.107 163.388,27.200 163.319,27.200 162.311 C 27.200 160.748,25.703 160.627,24.612 162.103 M226.844 161.740 C 226.844 161.914,227.084 162.149,227.378 162.262 C 227.703 162.387,227.911 162.262,227.911 161.944 C 227.911 161.657,227.671 161.422,227.378 161.422 C 227.084 161.422,226.844 161.565,226.844 161.740 M227.982 163.627 C 227.277 164.332,227.498 164.978,228.444 164.978 C 229.006 164.978,229.333 164.777,229.333 164.433 C 229.333 164.133,229.693 163.743,230.133 163.567 C 230.839 163.283,230.785 163.242,229.671 163.223 C 228.977 163.210,228.217 163.392,227.982 163.627 M33.812 164.403 C 33.329 164.985,34.134 165.447,35.031 165.103 C 35.578 164.893,35.131 163.911,34.489 163.911 C 34.341 163.911,34.037 164.132,33.812 164.403 M205.856 191.310 C 204.736 193.402,206.393 194.820,208.338 193.434 C 209.205 192.817,209.398 192.795,209.993 193.245 C 211.001 194.008,212.530 193.918,212.796 193.080 C 213.292 191.518,211.309 190.114,209.770 190.937 C 209.291 191.194,209.067 191.197,209.067 190.946 C 209.067 190.209,206.275 190.526,205.856 191.310 M246.920 220.111 C 246.791 220.318,246.302 220.634,245.832 220.813 C 244.712 221.239,244.752 221.718,245.956 222.303 C 246.766 222.697,246.914 222.973,246.822 223.918 C 246.725 224.918,246.866 225.131,247.978 225.661 C 248.678 225.995,249.244 226.529,249.244 226.855 C 249.244 227.515,250.320 228.622,250.961 228.622 C 251.190 228.622,251.378 228.782,251.378 228.978 C 251.378 229.173,251.629 229.333,251.935 229.333 C 252.585 229.333,252.298 227.977,251.522 227.379 C 251.267 227.183,250.718 226.100,250.302 224.973 C 249.752 223.483,249.264 222.778,248.516 222.391 C 247.631 221.933,247.516 221.709,247.699 220.796 C 247.908 219.750,247.412 219.314,246.920 220.111 M202.447 337.225 C 202.189 337.897,204.008 340.161,205.151 340.594 C 211.915 343.151,213.452 343.376,213.268 341.778 C 213.172 340.944,212.883 340.713,211.300 340.206 C 210.279 339.879,209.083 339.359,208.643 339.050 C 208.202 338.741,207.372 338.489,206.799 338.489 C 206.225 338.489,205.232 338.089,204.591 337.600 C 203.260 336.585,202.728 336.492,202.447 337.225 ");
				attr(path0, "stroke", "none");
				attr(path0, "fill", "#361c1b");
				attr(path0, "fill-rule", "evenodd");
				add_location(path0, file$7, 9, 169, 344);
				attr(path1, "id", "path1");
				attr(path1, "d", "M134.202 39.556 C 133.626 40.191,132.759 41.496,132.276 42.455 C 131.593 43.813,131.063 44.347,129.882 44.869 C 128.000 45.702,127.349 46.728,128.145 47.608 C 128.856 48.394,126.916 50.497,125.492 50.486 C 121.379 50.453,119.033 51.576,116.799 54.647 C 116.017 55.721,114.774 57.287,114.036 58.127 C 112.804 59.528,112.253 60.388,110.259 64.024 C 109.876 64.722,108.892 65.899,108.073 66.639 L 106.583 67.985 105.825 67.226 C 105.198 66.598,105.067 66.043,105.067 64.013 C 105.067 61.821,104.962 61.451,104.089 60.538 C 103.266 59.679,103.111 59.209,103.111 57.574 C 103.111 56.099,102.902 55.324,102.240 54.350 C 101.762 53.646,101.264 52.646,101.134 52.129 C 101.004 51.612,100.480 50.860,99.969 50.458 C 99.438 50.040,98.786 48.940,98.446 47.886 L 97.851 46.044 97.814 47.350 C 97.782 48.490,97.647 48.683,96.741 48.882 C 94.544 49.365,95.533 50.650,98.309 50.919 C 99.240 51.009,99.457 51.255,100.038 52.878 C 100.438 53.993,100.971 54.818,101.373 54.946 C 102.206 55.210,102.346 55.845,102.520 60.147 C 102.632 62.907,102.813 63.831,103.443 64.851 C 103.898 65.586,104.312 66.983,104.429 68.171 C 104.672 70.651,105.049 71.467,105.951 71.467 C 106.746 71.467,108.444 70.747,108.444 70.410 C 108.444 70.283,108.907 69.707,109.471 69.129 C 110.036 68.551,110.747 67.483,111.052 66.754 C 111.356 66.026,112.090 64.826,112.684 64.087 C 113.277 63.349,113.868 62.216,113.998 61.568 C 114.166 60.727,114.615 60.149,115.571 59.546 C 116.613 58.888,116.961 58.402,117.143 57.350 C 117.372 56.025,118.740 54.044,119.426 54.044 C 119.617 54.044,119.863 53.764,119.972 53.422 C 120.251 52.543,121.833 51.944,123.911 51.930 C 128.971 51.897,128.509 51.773,129.878 53.531 C 130.962 54.922,131.170 55.054,131.355 54.470 C 131.474 54.096,132.200 53.109,132.969 52.277 L 134.366 50.763 134.605 51.715 C 134.757 52.319,134.617 53.169,134.222 54.045 C 133.235 56.234,134.041 60.089,135.486 60.089 C 136.039 60.089,136.590 60.249,136.711 60.444 C 136.931 60.801,136.302 60.930,134.886 60.819 C 134.469 60.787,133.599 61.082,132.952 61.475 L 131.778 62.189 132.796 62.576 C 133.356 62.789,135.026 63.295,136.507 63.701 C 137.988 64.106,139.452 64.511,139.760 64.600 C 140.068 64.689,140.613 65.473,140.971 66.342 C 141.584 67.827,141.689 67.910,142.732 67.714 C 143.619 67.548,144.115 67.725,145.213 68.598 C 145.969 69.198,146.714 69.689,146.869 69.689 C 147.025 69.689,147.255 70.013,147.380 70.408 C 147.580 71.037,147.873 71.117,149.712 71.045 C 150.989 70.994,151.984 71.131,152.245 71.392 C 152.757 71.904,154.182 71.963,154.478 71.485 C 154.593 71.299,154.348 70.966,153.934 70.744 C 152.346 69.894,154.286 67.015,157.054 66.115 C 157.794 65.874,158.716 65.459,159.101 65.194 C 159.487 64.928,160.160 64.711,160.597 64.711 C 161.488 64.711,163.580 63.394,164.829 62.047 C 165.755 61.048,166.472 60.919,167.075 61.645 C 167.391 62.026,167.285 62.320,166.591 62.978 C 166.102 63.442,165.698 64.020,165.695 64.262 C 165.689 64.695,163.810 68.403,162.749 70.073 C 161.149 72.594,161.858 74.269,164.046 73.139 C 166.666 71.786,167.073 72.324,167.814 78.122 C 168.269 81.682,168.179 82.131,167.001 82.138 C 166.505 82.141,165.931 82.592,165.419 83.382 C 164.845 84.268,164.355 84.622,163.703 84.622 C 163.130 84.622,162.391 85.052,161.718 85.778 C 161.129 86.413,160.269 87.333,159.808 87.822 C 158.410 89.303,157.667 92.415,158.578 92.978 C 158.773 93.099,158.933 92.970,158.933 92.692 C 158.933 92.207,159.951 90.722,161.966 88.267 C 163.537 86.353,164.603 86.917,164.617 89.668 C 164.620 90.194,164.454 90.728,164.249 90.855 C 163.647 91.228,164.591 92.089,165.602 92.089 C 166.152 92.089,166.922 92.543,167.611 93.274 C 168.333 94.040,169.195 94.534,170.047 94.673 C 171.683 94.938,172.108 94.422,170.666 93.920 C 169.080 93.367,169.504 91.961,171.467 91.265 C 172.623 90.855,172.247 89.274,170.856 88.693 C 169.409 88.088,169.486 87.344,171.053 86.798 C 171.625 86.599,172.240 86.049,172.419 85.577 C 173.079 83.841,178.509 83.971,180.346 85.766 C 181.355 86.753,181.436 86.773,182.080 86.190 C 182.959 85.395,182.941 85.212,182.040 85.774 C 181.415 86.164,181.222 86.101,180.528 85.275 C 179.176 83.664,177.555 83.090,174.080 82.993 L 170.916 82.904 170.459 81.575 C 170.002 80.248,170.004 80.245,171.668 78.602 C 173.883 76.416,174.933 75.007,174.933 74.223 C 174.933 73.868,175.157 73.492,175.430 73.387 C 175.703 73.283,176.433 72.168,177.052 70.910 C 178.055 68.872,178.292 68.622,179.222 68.622 C 180.506 68.622,180.580 67.959,179.444 66.639 C 178.741 65.822,178.511 65.741,177.867 66.085 C 176.756 66.680,176.106 66.579,175.897 65.778 C 175.795 65.387,175.519 65.067,175.284 65.067 C 174.879 65.067,174.935 65.717,175.508 67.644 C 175.651 68.127,175.481 68.267,174.749 68.267 C 174.077 68.267,173.245 68.831,171.860 70.227 C 168.921 73.190,167.467 73.902,167.467 72.378 C 167.467 71.242,166.535 71.096,164.885 71.973 C 162.215 73.392,162.179 72.638,164.678 67.758 C 165.687 65.789,166.921 63.639,167.420 62.979 L 168.327 61.781 167.505 61.115 C 166.496 60.298,165.103 60.530,164.089 61.685 C 163.698 62.130,163.004 62.609,162.547 62.748 C 162.090 62.887,160.495 63.625,159.002 64.389 C 157.508 65.153,156.016 65.778,155.686 65.778 C 154.889 65.778,152.178 67.570,152.178 68.097 C 152.178 69.434,149.707 70.138,148.424 69.167 C 148.044 68.880,147.478 68.640,147.166 68.634 C 146.855 68.627,146.135 68.218,145.566 67.724 C 144.413 66.722,143.212 66.306,142.386 66.623 C 141.683 66.893,140.302 63.838,140.597 62.668 C 141.253 60.075,141.255 59.974,140.652 59.533 C 140.251 59.240,139.976 58.384,139.844 57.011 C 139.694 55.463,139.415 54.688,138.749 53.972 L 137.854 53.011 138.648 51.127 C 139.085 50.092,139.630 49.084,139.859 48.889 C 140.878 48.019,141.142 46.675,140.421 46.023 C 140.043 45.681,139.733 45.130,139.733 44.800 C 139.733 43.865,138.508 42.981,136.916 42.767 C 135.560 42.586,134.839 41.956,135.987 41.956 C 137.208 41.956,137.671 39.364,136.557 38.768 C 135.542 38.225,135.351 38.289,134.202 39.556 M145.152 43.318 C 144.706 43.601,144.218 50.233,144.614 50.629 C 144.894 50.909,147.200 48.418,147.200 47.837 C 147.200 47.559,147.053 47.240,146.874 47.129 C 146.688 47.015,146.784 46.327,147.098 45.529 C 147.920 43.437,146.860 42.233,145.152 43.318 M148.324 46.062 C 147.995 46.784,148.019 47.177,148.444 48.000 C 148.738 48.567,148.978 49.279,148.978 49.582 C 148.978 50.419,150.014 50.241,150.424 49.333 C 150.623 48.893,151.005 48.150,151.273 47.683 C 152.016 46.386,151.330 45.156,149.867 45.156 C 149.000 45.156,148.640 45.367,148.324 46.062 M162.044 49.667 C 161.702 49.757,161.422 49.995,161.422 50.197 C 161.422 50.400,161.675 50.468,161.985 50.349 C 162.294 50.230,162.774 50.133,163.051 50.133 C 163.329 50.133,163.556 49.973,163.556 49.778 C 163.556 49.413,163.136 49.382,162.044 49.667 M152.072 51.592 C 152.354 51.874,152.651 51.877,153.121 51.603 C 153.697 51.269,153.648 51.220,152.729 51.211 C 151.964 51.203,151.786 51.306,152.072 51.592 M158.222 51.763 C 157.733 52.034,156.745 52.259,156.025 52.261 C 154.589 52.267,154.356 52.441,152.533 54.859 C 151.849 55.767,150.809 56.752,150.222 57.047 C 149.636 57.342,148.685 58.228,148.110 59.014 C 147.534 59.801,146.943 60.444,146.795 60.444 C 146.647 60.444,146.694 60.928,146.900 61.519 C 147.178 62.315,147.162 62.729,146.838 63.119 C 146.478 63.552,146.524 63.644,147.099 63.644 C 147.799 63.644,148.622 62.360,148.622 61.270 C 148.622 60.473,152.079 57.012,153.393 56.493 C 153.996 56.255,154.729 55.859,155.022 55.614 C 156.170 54.652,157.360 54.650,157.988 55.609 C 158.730 56.741,159.644 56.467,159.644 55.114 C 159.644 54.570,159.883 53.667,160.176 53.107 C 161.171 51.199,160.308 50.605,158.222 51.763 M155.781 53.748 C 155.466 54.601,154.099 55.276,153.769 54.741 C 153.654 54.555,153.969 54.217,154.469 53.989 C 154.969 53.761,155.378 53.440,155.378 53.276 C 155.378 53.112,155.533 52.978,155.722 52.978 C 155.925 52.978,155.950 53.292,155.781 53.748 M141.601 56.711 C 141.605 57.493,141.678 57.771,141.763 57.329 C 141.848 56.887,141.844 56.247,141.755 55.907 C 141.666 55.567,141.597 55.929,141.601 56.711 M138.860 59.998 C 138.696 60.425,138.557 60.441,138.122 60.080 C 137.539 59.596,137.706 57.680,138.447 56.356 C 138.888 55.567,139.270 58.931,138.860 59.998 M104.494 57.333 C 104.409 58.298,104.610 59.572,104.895 59.869 C 105.259 60.248,105.768 57.804,105.436 57.268 C 105.117 56.750,104.542 56.790,104.494 57.333 M171.970 63.526 C 171.322 64.174,171.751 65.422,172.622 65.422 C 173.661 65.422,173.924 63.879,172.949 63.505 C 172.252 63.237,172.259 63.237,171.970 63.526 M151.773 64.808 C 150.654 65.761,150.202 66.844,150.924 66.844 C 151.199 66.844,151.524 66.684,151.644 66.489 C 151.765 66.293,152.180 66.133,152.565 66.133 C 153.464 66.133,153.845 65.160,153.200 64.514 C 152.773 64.088,152.569 64.130,151.773 64.808 M175.623 70.986 C 175.709 71.064,175.429 71.373,175.001 71.673 C 174.504 72.021,174.222 72.591,174.222 73.249 C 174.222 75.517,171.855 77.832,169.511 77.854 C 166.861 77.879,169.205 72.633,172.131 71.991 C 172.698 71.866,173.330 71.450,173.536 71.065 C 173.873 70.434,174.969 70.392,175.623 70.986 M133.067 72.930 C 132.538 73.473,132.474 74.667,132.974 74.667 C 133.167 74.667,134.209 75.467,135.289 76.444 C 137.611 78.548,137.605 78.547,139.788 77.067 C 141.529 75.887,142.116 74.371,141.080 73.731 C 139.787 72.932,133.660 72.320,133.067 72.930 M139.111 74.006 C 141.021 74.482,140.663 75.973,138.437 76.820 C 137.377 77.223,136.945 77.018,135.694 75.520 C 133.943 73.422,134.962 72.971,139.111 74.006 M142.746 75.393 C 142.425 75.913,143.243 76.800,144.044 76.800 C 144.411 76.800,144.711 77.049,144.711 77.354 C 144.711 77.659,144.868 77.812,145.059 77.693 C 145.455 77.449,144.848 76.185,144.000 75.485 C 143.338 74.939,143.040 74.917,142.746 75.393 M178.380 78.805 C 178.255 78.930,178.233 79.163,178.332 79.323 C 178.554 79.682,179.556 79.331,179.556 78.895 C 179.556 78.530,178.719 78.466,178.380 78.805 M103.275 81.152 C 103.149 81.481,102.748 81.845,102.385 81.960 C 101.547 82.226,101.328 82.939,101.165 85.938 C 101.000 88.965,100.753 89.600,99.740 89.600 C 98.776 89.600,98.565 90.384,98.255 95.111 C 98.097 97.526,98.187 98.785,98.623 100.242 C 98.940 101.304,99.200 103.338,99.200 104.762 C 99.200 106.823,99.335 107.480,99.863 107.986 C 100.228 108.336,100.855 109.582,101.257 110.756 C 101.659 111.929,102.337 113.689,102.764 114.667 C 103.190 115.644,104.079 118.132,104.738 120.195 C 105.530 122.675,106.240 124.232,106.834 124.791 C 107.329 125.255,107.733 125.841,107.733 126.093 C 107.733 126.345,108.453 127.291,109.333 128.197 C 110.213 129.102,110.933 129.988,110.933 130.166 C 110.933 130.344,111.093 130.489,111.289 130.489 C 111.787 130.489,112.774 131.531,113.709 133.044 C 114.146 133.751,114.740 134.420,115.029 134.531 C 115.319 134.642,115.556 134.958,115.556 135.233 C 115.556 135.508,116.050 135.832,116.655 135.953 C 117.354 136.093,117.824 136.439,117.946 136.905 C 118.063 137.353,118.531 137.715,119.156 137.840 C 119.792 137.967,120.444 138.480,120.893 139.206 C 123.466 143.370,133.337 145.833,137.807 143.426 C 139.358 142.591,140.377 142.975,139.631 144.113 C 139.242 144.706,139.194 145.106,139.455 145.573 C 139.663 145.945,139.716 147.057,139.580 148.219 C 139.450 149.321,139.217 151.982,139.062 154.133 C 138.906 156.284,138.668 158.295,138.532 158.601 C 138.375 158.957,138.676 159.650,139.365 160.517 C 140.635 162.115,140.810 163.556,139.733 163.556 C 139.342 163.556,138.706 163.872,138.320 164.258 C 137.934 164.644,136.506 165.520,135.146 166.204 C 133.787 166.889,132.425 167.806,132.120 168.241 C 131.405 169.262,127.094 172.701,126.157 172.999 C 125.761 173.124,124.854 173.627,124.141 174.116 C 122.432 175.287,119.227 175.130,116.890 173.761 C 115.415 172.896,110.222 167.992,110.222 167.464 C 110.222 167.223,106.679 164.444,103.865 162.479 C 101.349 160.722,94.987 158.209,93.100 158.227 C 92.837 158.229,91.262 157.838,89.600 157.356 C 87.938 156.875,85.593 156.284,84.389 156.042 C 82.343 155.630,82.220 155.551,82.501 154.814 C 82.844 153.909,82.711 148.752,82.319 147.822 C 81.976 147.006,81.695 147.037,81.123 147.953 C 80.762 148.532,80.557 148.609,80.237 148.285 C 79.920 147.963,79.969 147.755,80.444 147.404 C 80.787 147.151,81.067 146.627,81.067 146.240 C 81.067 144.963,82.427 140.188,83.290 138.434 C 83.757 137.486,84.353 136.031,84.615 135.200 C 84.877 134.369,85.197 133.689,85.325 133.689 C 85.453 133.689,85.896 133.088,86.309 132.353 C 86.722 131.618,87.467 130.634,87.964 130.167 C 88.461 129.700,89.055 128.741,89.283 128.037 C 89.512 127.332,89.969 126.356,90.298 125.867 C 90.628 125.378,91.105 124.458,91.359 123.822 C 91.648 123.098,92.066 122.667,92.481 122.667 C 93.360 122.667,93.667 121.330,93.186 119.597 C 92.675 117.758,92.674 115.124,93.184 116.000 C 94.030 117.452,94.792 116.567,95.672 113.107 C 95.999 111.822,96.462 110.968,97.082 110.510 C 98.331 109.587,98.569 105.147,97.404 104.524 C 96.655 104.123,96.477 102.777,97.092 102.162 C 97.362 101.892,97.212 101.732,96.576 101.610 C 96.034 101.506,95.610 101.621,95.503 101.900 C 95.191 102.714,91.758 103.467,88.362 103.467 C 86.579 103.467,84.962 103.625,84.768 103.819 C 84.574 104.012,83.622 104.266,82.652 104.382 C 80.541 104.635,75.201 106.150,73.956 106.850 C 73.467 107.124,72.054 107.853,70.816 108.469 C 65.714 111.009,58.380 117.094,56.892 120.023 C 55.149 123.455,51.575 127.644,50.391 127.644 C 50.196 127.644,49.688 128.004,49.261 128.444 C 48.376 129.356,44.576 132.667,43.963 133.061 C 43.208 133.546,42.143 133.329,40.048 132.267 C 37.729 131.091,37.512 131.111,37.226 132.526 C 37.117 133.068,36.927 133.770,36.804 134.087 C 36.680 134.408,36.834 134.916,37.150 135.233 C 37.671 135.754,37.644 135.820,36.821 136.026 C 35.499 136.358,35.130 138.070,35.776 140.879 C 37.092 146.597,37.080 146.414,36.230 147.838 C 34.319 151.044,31.410 153.118,27.930 153.757 C 27.158 153.898,26.137 154.321,25.660 154.696 C 25.183 155.071,24.489 155.378,24.117 155.378 C 21.860 155.378,20.833 158.736,22.251 161.478 C 23.181 163.276,21.999 165.681,20.178 165.695 C 19.738 165.699,18.738 166.143,17.956 166.681 C 16.541 167.656,12.541 170.551,11.217 171.560 C 10.835 171.851,10.399 172.089,10.248 172.089 C 9.530 172.089,6.731 175.462,5.710 177.557 C 5.081 178.847,4.424 179.992,4.249 180.100 C 4.074 180.208,3.760 180.930,3.552 181.704 C 3.330 182.528,2.957 183.111,2.653 183.111 C 2.353 183.111,2.130 183.450,2.126 183.911 C 2.115 184.968,0.847 187.733,0.373 187.733 C -0.154 187.733,-0.093 189.059,0.444 189.276 C 0.800 189.419,0.800 189.461,0.444 189.483 C -0.415 189.537,-0.182 327.285,0.679 328.146 C 1.053 328.520,1.542 329.760,1.766 330.902 C 1.990 332.043,2.313 333.378,2.483 333.867 C 2.653 334.356,2.979 336.116,3.206 337.778 C 3.715 341.506,3.740 341.536,6.800 342.052 C 10.102 342.609,20.670 342.496,21.645 341.893 C 21.823 341.784,23.545 341.682,25.473 341.666 C 30.731 341.625,30.447 341.815,30.330 338.404 C 30.273 336.769,30.058 335.407,29.834 335.269 C 29.564 335.102,29.548 334.811,29.785 334.356 C 31.049 331.926,29.985 324.196,28.238 323.116 C 26.982 322.340,27.281 319.254,28.674 318.619 C 30.678 317.706,29.215 314.099,26.121 312.325 C 24.853 311.598,27.432 306.946,29.309 306.575 C 30.688 306.302,30.758 306.221,31.105 304.504 C 31.495 302.579,32.330 301.298,33.842 300.308 C 35.519 299.210,36.414 295.545,35.304 294.318 C 34.844 293.810,34.788 293.501,35.073 293.046 C 35.578 292.240,36.755 292.103,37.319 292.783 C 38.264 293.922,39.837 293.333,42.234 290.942 C 43.568 289.611,44.957 289.434,47.083 290.322 C 48.580 290.948,48.917 290.836,49.146 289.639 C 49.384 288.394,48.937 287.833,47.268 287.282 C 46.456 287.014,45.708 286.577,45.606 286.311 C 45.463 285.941,45.232 286.005,44.613 286.586 C 43.846 287.307,43.751 287.316,42.703 286.774 C 40.670 285.723,42.197 284.148,44.313 285.112 C 44.934 285.395,45.401 285.405,45.887 285.145 C 46.878 284.614,46.751 284.303,45.256 283.590 C 43.617 282.809,43.920 282.592,47.963 281.650 C 49.746 281.235,51.409 280.584,52.292 279.955 C 55.992 277.319,58.323 276.048,60.427 275.517 C 61.950 275.133,62.776 274.628,64.281 273.159 C 66.070 271.412,66.317 271.286,68.032 271.251 C 69.041 271.230,70.187 271.190,70.578 271.161 C 72.278 271.035,72.686 271.623,71.651 272.705 C 70.454 273.954,70.535 275.292,71.822 275.553 C 73.165 275.825,75.023 277.365,75.017 278.200 C 75.004 279.879,74.434 280.003,73.122 278.612 L 71.871 277.285 68.380 277.418 C 65.116 277.542,64.018 277.782,61.333 278.953 C 60.747 279.208,59.867 279.532,59.378 279.671 C 58.889 279.810,58.212 280.261,57.873 280.673 C 57.535 281.085,57.107 281.602,56.923 281.822 C 56.739 282.042,55.856 282.332,54.961 282.466 C 53.144 282.739,53.003 282.968,54.064 283.929 C 54.666 284.474,54.916 284.515,55.482 284.162 C 55.859 283.926,56.390 283.733,56.661 283.733 C 56.932 283.733,57.910 283.399,58.835 282.990 C 59.759 282.581,60.826 282.328,61.206 282.427 C 61.587 282.527,62.301 282.399,62.794 282.143 C 63.839 281.601,65.067 281.817,65.067 282.543 C 65.067 283.622,63.932 284.800,62.892 284.800 C 62.250 284.800,61.867 284.986,61.867 285.298 C 61.867 285.572,61.347 286.131,60.711 286.541 C 60.076 286.950,59.088 287.597,58.516 287.977 C 57.713 288.512,57.318 288.585,56.780 288.297 C 56.198 287.986,55.904 288.128,54.976 289.170 C 54.292 289.937,53.301 290.567,52.392 290.811 C 50.931 291.204,50.489 291.709,50.489 292.986 C 50.489 293.930,49.845 294.201,48.858 293.673 C 47.190 292.780,46.170 294.466,46.996 296.752 C 47.552 298.289,47.016 300.063,45.151 302.856 C 44.275 304.168,43.594 305.704,43.374 306.866 C 43.177 307.903,42.778 309.014,42.487 309.336 C 41.724 310.178,40.181 313.315,40.179 314.026 C 40.178 314.358,39.778 315.062,39.289 315.589 C 38.596 316.336,38.400 316.927,38.400 318.262 C 38.400 319.579,38.244 320.058,37.726 320.336 C 36.898 320.779,36.116 322.836,36.594 323.314 C 37.176 323.896,37.968 323.294,38.230 322.068 C 38.369 321.420,38.769 320.617,39.118 320.285 C 39.468 319.953,39.863 319.033,39.997 318.242 C 40.130 317.451,40.381 316.716,40.555 316.609 C 40.728 316.502,41.040 315.782,41.248 315.010 C 41.519 314.003,41.936 313.444,42.721 313.039 C 44.214 312.267,44.583 312.763,43.918 314.647 C 43.621 315.489,43.378 317.198,43.378 318.445 C 43.378 320.483,43.305 320.711,42.658 320.711 C 42.212 320.711,41.806 321.059,41.591 321.623 C 41.103 322.907,41.155 323.202,41.867 323.185 C 42.510 323.169,44.481 319.639,44.457 318.544 C 44.450 318.232,44.764 317.687,45.156 317.333 C 45.662 316.875,45.867 316.238,45.867 315.121 C 45.867 313.830,46.071 313.343,47.022 312.373 C 47.658 311.724,48.338 311.017,48.533 310.800 C 48.729 310.584,49.409 309.991,50.044 309.483 C 50.680 308.975,51.207 308.373,51.214 308.146 C 51.222 307.919,51.702 307.179,52.281 306.502 C 52.860 305.825,53.338 305.105,53.343 304.902 C 53.349 304.699,53.820 303.917,54.390 303.164 C 54.960 302.411,55.536 301.293,55.671 300.680 C 56.009 299.141,56.810 298.014,58.008 297.395 C 58.573 297.103,59.022 296.577,59.022 296.207 C 59.022 295.277,60.088 293.027,61.243 291.521 C 61.780 290.821,62.403 289.702,62.627 289.035 C 63.108 287.603,63.923 286.578,64.581 286.578 C 64.840 286.578,65.373 285.949,65.765 285.180 C 66.158 284.411,66.641 283.681,66.839 283.559 C 67.038 283.436,67.200 282.865,67.200 282.290 C 67.200 281.287,67.265 281.244,68.811 281.244 C 70.960 281.244,71.530 282.360,70.028 283.624 C 69.363 284.183,68.958 284.971,68.750 286.110 C 68.479 287.587,68.315 287.811,67.310 288.071 C 65.824 288.456,64.970 293.156,66.386 293.156 C 67.310 293.156,71.111 289.911,71.111 289.122 C 71.111 288.896,71.247 288.711,71.413 288.711 C 71.579 288.711,71.969 288.062,72.281 287.269 C 72.593 286.475,73.057 285.854,73.313 285.888 C 74.393 286.034,74.612 285.778,74.843 284.102 C 75.061 282.516,75.239 282.239,76.602 281.377 C 77.437 280.849,78.583 279.727,79.149 278.883 C 79.715 278.039,80.298 277.345,80.444 277.341 C 81.964 277.297,82.451 275.062,81.067 274.489 C 78.984 273.626,80.268 271.334,83.383 270.352 C 84.980 269.848,85.821 269.229,88.257 266.760 C 91.190 263.786,91.205 263.777,92.769 263.940 C 94.438 264.114,97.116 262.664,99.173 260.474 C 99.708 259.904,100.419 259.556,101.047 259.556 C 101.603 259.556,102.692 259.156,103.467 258.667 C 104.241 258.178,105.117 257.778,105.412 257.778 C 105.708 257.778,106.378 257.298,106.900 256.711 C 107.443 256.102,108.207 255.644,108.681 255.644 C 109.369 255.644,109.511 255.459,109.511 254.564 C 109.511 253.969,109.831 252.856,110.222 252.089 C 110.635 251.280,110.933 249.993,110.933 249.023 C 110.933 247.142,112.266 244.456,113.373 244.104 C 114.318 243.805,115.200 244.235,115.200 244.995 C 115.200 245.764,115.766 246.212,116.085 245.695 C 116.416 245.160,118.830 245.278,119.608 245.867 C 119.979 246.147,120.459 246.267,120.675 246.132 C 120.890 245.997,122.107 245.860,123.378 245.827 C 124.649 245.794,125.997 245.709,126.374 245.639 C 126.923 245.537,127.136 245.817,127.441 247.041 C 127.834 248.620,128.434 249.055,128.665 247.930 C 128.738 247.577,128.950 246.889,129.137 246.400 L 129.477 245.511 130.206 246.400 C 130.910 247.258,130.949 247.265,131.334 246.601 C 132.539 244.523,135.566 243.442,136.780 244.655 C 137.061 244.936,137.384 244.928,137.947 244.627 C 138.581 244.287,138.848 244.320,139.382 244.804 C 140.073 245.429,141.511 245.254,141.511 244.543 C 141.511 244.323,141.780 244.390,142.133 244.698 C 142.476 244.995,143.662 245.340,144.770 245.463 C 145.878 245.587,147.019 245.778,147.307 245.889 C 148.570 246.373,147.402 243.781,146.032 243.059 L 144.711 242.364 144.711 239.596 L 144.711 236.829 146.127 236.404 C 146.998 236.143,147.630 235.704,147.770 235.262 C 147.989 234.572,148.016 234.577,148.456 235.399 C 149.129 236.656,148.540 237.511,147.001 237.511 C 145.763 237.511,145.067 238.347,145.067 239.833 C 145.067 240.754,146.437 241.182,147.389 240.559 C 147.858 240.251,148.542 240.000,148.908 240.000 C 149.790 240.000,150.328 238.715,150.130 237.079 C 149.830 234.603,153.808 233.814,154.454 236.222 C 155.586 240.440,153.990 244.039,151.156 243.659 C 149.365 243.419,149.148 243.868,150.178 245.682 L 151.022 247.167 151.404 246.072 C 152.182 243.841,153.612 245.281,153.750 248.434 C 153.833 250.315,154.311 250.896,154.311 249.115 C 154.311 246.716,155.173 245.269,156.525 245.399 C 157.594 245.502,157.680 245.601,157.583 246.621 C 157.430 248.235,160.251 248.905,161.149 247.467 C 162.271 245.670,164.622 247.146,164.622 249.646 C 164.622 250.795,164.713 250.932,165.357 250.764 C 165.877 250.628,165.981 250.461,165.712 250.192 C 164.577 249.057,166.239 246.044,168.002 246.044 C 168.078 246.044,168.419 247.035,168.759 248.246 C 169.317 250.234,169.406 250.360,169.678 249.545 C 169.843 249.048,170.414 248.417,170.945 248.143 C 172.255 247.468,172.380 247.237,172.645 244.981 C 172.772 243.904,173.101 242.663,173.378 242.224 L 173.880 241.426 174.851 242.473 C 176.418 244.163,177.106 244.038,177.708 241.956 C 177.990 240.978,178.294 239.938,178.382 239.644 C 178.598 238.929,179.863 241.532,180.140 243.260 C 180.256 243.985,180.652 244.901,181.020 245.296 C 181.496 245.808,181.692 246.557,181.700 247.896 C 181.715 250.308,182.337 251.195,183.807 250.901 C 184.695 250.723,184.889 250.800,184.889 251.332 C 184.889 252.149,185.853 253.030,187.085 253.338 C 187.608 253.468,188.313 253.881,188.651 254.254 C 189.407 255.090,191.401 255.149,192.877 254.379 C 193.458 254.076,194.260 253.911,194.660 254.011 C 195.241 254.157,195.565 253.858,196.271 252.526 C 197.512 250.187,198.740 249.548,200.085 250.542 C 200.640 250.952,201.593 251.398,202.202 251.532 C 203.022 251.712,203.414 252.069,203.715 252.910 C 203.939 253.534,204.515 254.805,204.994 255.734 C 205.474 256.663,205.869 257.783,205.872 258.222 C 205.879 259.218,206.188 259.693,207.159 260.204 C 207.577 260.424,208.028 261.041,208.162 261.575 C 208.296 262.109,208.710 262.759,209.082 263.019 C 209.453 263.280,209.931 264.136,210.142 264.922 C 210.354 265.708,211.079 266.962,211.752 267.708 C 212.426 268.454,212.978 269.237,212.978 269.448 C 212.978 269.659,213.216 269.965,213.507 270.128 C 213.805 270.294,214.137 271.197,214.266 272.190 C 214.393 273.161,214.708 274.201,214.967 274.501 C 215.226 274.801,215.828 275.921,216.305 276.990 C 216.782 278.059,217.589 279.540,218.097 280.282 C 218.606 281.024,219.022 281.963,219.022 282.369 C 219.022 282.774,219.502 283.653,220.089 284.321 C 220.676 284.989,221.156 285.690,221.156 285.879 C 221.156 286.068,221.376 286.222,221.645 286.222 C 222.281 286.222,221.998 283.099,221.288 282.283 C 221.016 281.970,220.800 280.945,220.800 279.969 C 220.800 278.629,220.640 278.116,220.122 277.792 C 219.725 277.544,219.291 276.653,219.074 275.642 C 218.870 274.693,218.297 273.205,217.801 272.336 C 217.304 271.467,216.896 270.549,216.893 270.298 C 216.884 269.358,212.883 259.716,212.320 259.276 C 210.608 257.941,209.082 256.494,209.075 256.201 C 209.070 256.018,208.727 255.507,208.312 255.065 C 207.250 253.935,207.628 252.452,208.985 252.426 L 209.956 252.407 209.156 251.849 C 208.716 251.542,208.356 251.009,208.356 250.664 C 208.356 250.319,208.117 249.579,207.824 249.018 C 206.664 246.793,207.092 244.558,208.889 243.473 C 209.769 242.941,210.489 242.271,210.489 241.982 C 210.489 241.694,211.039 241.039,211.711 240.527 C 212.436 239.973,213.031 239.147,213.174 238.493 C 213.518 236.927,215.568 234.855,217.281 234.342 C 218.419 234.001,218.673 233.783,218.481 233.310 C 217.253 230.296,217.725 228.793,219.794 229.124 C 220.785 229.282,221.433 229.153,222.299 228.626 C 223.902 227.648,224.414 227.719,226.133 229.156 C 227.342 230.165,227.919 230.400,229.194 230.400 C 230.058 230.400,231.074 230.593,231.452 230.829 C 232.016 231.181,232.266 231.141,232.860 230.604 C 233.534 229.994,233.640 229.989,234.467 230.531 C 234.954 230.850,235.764 231.111,236.266 231.111 C 236.768 231.111,237.754 231.352,238.457 231.645 C 239.649 232.143,239.816 232.130,240.931 231.441 C 242.564 230.431,243.336 230.649,243.556 232.182 C 243.719 233.321,243.849 233.438,245.156 233.610 L 246.578 233.798 244.909 234.008 C 243.992 234.124,242.996 234.465,242.695 234.765 C 242.395 235.065,240.986 235.496,239.564 235.722 C 238.141 235.949,236.228 236.444,235.312 236.823 C 234.396 237.201,232.980 237.511,232.166 237.511 L 230.686 237.511 230.939 239.733 C 231.079 240.956,231.329 242.215,231.495 242.531 C 231.900 243.302,231.576 243.556,230.184 243.556 C 228.888 243.556,228.507 243.909,228.848 244.798 C 229.091 245.431,231.266 245.290,231.982 244.595 C 232.168 244.414,232.808 244.288,233.404 244.315 C 234.242 244.352,234.307 244.399,233.689 244.518 C 232.108 244.822,232.552 247.609,234.263 248.121 C 236.026 248.650,237.687 248.644,239.175 248.106 C 241.282 247.345,240.384 246.423,237.511 246.399 C 236.827 246.394,236.053 246.254,235.792 246.088 C 235.031 245.606,236.176 245.333,238.962 245.333 C 240.828 245.333,241.422 245.214,241.422 244.838 C 241.422 243.957,245.005 243.447,245.505 244.257 C 245.623 244.448,246.952 244.596,248.460 244.587 C 251.461 244.568,252.736 244.913,253.876 246.053 C 254.433 246.611,254.881 246.745,255.632 246.581 C 256.828 246.318,260.401 247.285,261.680 248.219 C 262.983 249.169,266.930 250.343,268.889 250.363 C 269.818 250.372,270.647 250.492,270.732 250.629 C 271.448 251.787,267.574 252.495,264.628 251.744 C 263.696 251.507,261.776 251.253,260.362 251.179 C 258.947 251.106,256.907 250.789,255.827 250.475 C 253.621 249.834,250.260 250.049,249.574 250.876 C 249.306 251.198,248.663 251.310,247.658 251.208 C 246.387 251.079,246.023 251.195,245.386 251.927 C 244.968 252.407,244.386 252.800,244.091 252.800 C 243.422 252.800,243.393 253.645,244.044 254.185 C 244.656 254.693,245.590 254.373,246.828 253.231 C 248.225 251.940,254.279 252.573,257.600 254.356 C 258.187 254.671,258.937 254.930,259.268 254.931 C 260.117 254.934,260.354 255.485,259.729 256.003 C 259.068 256.552,259.046 257.067,259.684 257.067 C 259.951 257.067,260.773 257.547,261.511 258.133 C 262.249 258.720,263.047 259.200,263.283 259.200 C 264.026 259.200,264.829 260.397,264.950 261.687 C 265.054 262.790,265.307 263.067,267.200 264.155 C 268.754 265.047,269.913 266.123,271.467 268.116 C 272.640 269.621,274.019 271.107,274.532 271.419 C 275.467 271.988,276.191 274.004,275.649 274.530 C 275.169 274.996,273.067 273.863,273.067 273.139 C 273.067 272.326,271.997 271.289,271.158 271.289 C 270.823 271.289,270.075 270.969,269.497 270.578 C 268.918 270.187,267.924 269.512,267.289 269.079 C 265.429 267.811,260.978 267.235,260.978 268.262 C 260.978 269.096,266.134 273.930,267.650 274.518 C 268.415 274.815,268.886 275.105,271.536 276.908 C 272.161 277.333,273.400 277.876,274.291 278.114 C 275.181 278.352,275.991 278.804,276.091 279.118 C 276.191 279.432,276.993 280.197,277.873 280.818 C 280.107 282.392,280.796 283.938,280.241 286.135 C 279.700 288.281,279.436 291.255,278.845 301.867 C 278.575 306.717,278.205 307.712,277.491 305.504 C 277.284 304.864,276.764 304.095,276.335 303.795 C 275.906 303.494,275.556 303.017,275.556 302.734 C 275.556 302.451,275.236 301.623,274.844 300.893 C 274.453 300.163,274.133 299.155,274.133 298.652 C 274.133 298.149,273.733 297.196,273.244 296.533 C 272.756 295.871,272.356 295.120,272.356 294.864 C 272.356 294.223,271.313 294.278,271.062 294.933 C 270.949 295.227,270.554 295.467,270.184 295.467 C 269.416 295.467,269.372 295.324,269.862 294.408 C 270.245 293.694,269.529 291.157,268.662 290.151 C 268.400 289.848,267.907 288.852,267.566 287.937 C 267.225 287.022,266.571 285.922,266.113 285.492 C 265.656 285.062,265.180 284.248,265.056 283.683 C 264.913 283.032,264.438 282.452,263.765 282.104 C 263.179 281.801,262.477 281.021,262.206 280.371 C 261.632 278.998,259.864 278.133,259.219 278.910 C 258.776 279.444,259.591 281.733,260.392 282.203 C 260.660 282.360,261.218 283.209,261.631 284.089 C 262.555 286.053,263.663 288.033,264.162 288.608 C 264.623 289.140,265.330 292.331,265.178 293.196 C 265.091 293.694,265.395 293.889,266.583 294.098 C 268.861 294.499,268.800 294.325,268.800 300.422 C 268.800 306.795,268.312 308.990,267.067 308.212 C 265.361 307.147,263.186 310.262,263.794 312.901 C 263.996 313.774,264.164 315.457,264.169 316.640 C 264.174 317.823,264.352 318.965,264.564 319.178 C 265.173 319.786,264.415 320.018,263.075 319.634 C 260.646 318.937,259.634 319.317,260.803 320.486 C 261.348 321.030,260.208 322.359,259.547 321.950 C 259.411 321.866,257.397 321.705,255.072 321.593 C 248.267 321.264,248.701 321.342,248.791 320.471 C 248.912 319.300,246.952 318.944,246.001 319.965 C 244.817 321.236,238.829 321.140,234.782 319.787 C 231.883 318.817,229.565 318.703,228.267 319.466 C 227.778 319.754,227.098 320.090,226.756 320.214 C 226.413 320.337,226.133 320.660,226.133 320.930 C 226.133 321.475,225.699 321.531,224.044 321.200 C 223.303 321.052,222.933 320.769,222.933 320.349 C 222.933 320.003,222.701 319.632,222.418 319.523 C 222.056 319.384,221.968 319.496,222.123 319.899 C 222.259 320.254,222.199 320.383,221.965 320.239 C 221.751 320.106,221.491 320.388,221.366 320.885 C 221.025 322.244,219.533 322.777,215.441 323.000 C 211.067 323.240,209.590 323.476,208.265 324.146 C 207.203 324.684,204.431 324.450,199.822 323.432 C 198.551 323.151,197.404 322.986,197.273 323.064 C 197.143 323.142,196.928 322.714,196.795 322.112 C 196.481 320.680,195.803 320.465,194.595 321.415 C 193.201 322.512,183.940 321.843,183.059 320.583 C 182.809 320.226,182.242 319.994,176.918 318.073 C 174.979 317.373,172.880 316.800,172.254 316.800 C 171.627 316.800,170.174 316.500,169.024 316.134 C 167.874 315.768,166.373 315.348,165.689 315.201 C 165.004 315.054,163.487 314.480,162.316 313.924 C 160.950 313.277,160.065 313.038,159.845 313.257 C 159.268 313.834,158.315 313.639,158.123 312.905 C 158.019 312.505,157.511 312.113,156.926 311.981 C 153.150 311.126,151.856 310.498,152.322 309.743 C 152.463 309.515,153.434 309.333,154.510 309.333 C 156.605 309.333,157.041 308.832,155.468 308.233 C 154.428 307.838,153.742 307.920,151.942 308.652 C 150.906 309.074,150.718 309.034,149.532 308.129 C 148.524 307.360,148.018 307.198,147.191 307.380 C 146.293 307.577,146.088 307.482,145.804 306.736 C 145.413 305.707,143.996 304.633,141.767 303.678 C 140.823 303.273,139.906 302.556,139.540 301.936 C 138.799 300.681,136.974 299.733,135.301 299.733 C 134.435 299.733,134.033 299.546,133.882 299.072 C 133.767 298.708,133.116 297.904,132.436 297.285 C 131.756 296.667,131.200 295.855,131.200 295.482 C 131.200 295.109,130.720 294.462,130.133 294.044 C 129.547 293.627,129.067 293.059,129.067 292.784 C 129.067 292.114,127.754 291.305,126.208 291.023 C 124.563 290.723,122.116 288.459,121.662 286.817 C 121.237 285.278,119.860 283.386,117.571 281.197 C 115.763 279.468,115.298 279.383,113.809 280.509 L 112.951 281.157 114.414 281.998 C 116.151 282.999,116.622 283.892,116.622 286.189 C 116.622 287.667,116.809 288.112,117.992 289.461 C 119.687 291.392,121.511 295.101,121.596 296.787 C 121.641 297.668,120.065 297.394,118.785 296.298 L 117.295 295.023 116.491 295.778 C 115.355 296.846,114.294 296.738,113.551 295.480 C 113.188 294.865,112.514 294.335,111.931 294.207 C 111.166 294.039,110.933 293.783,110.933 293.110 C 110.933 290.706,109.535 289.750,108.377 291.364 C 108.234 291.563,107.814 291.417,107.367 291.012 L 106.601 290.320 105.301 291.832 C 104.585 292.664,103.711 293.342,103.357 293.339 C 103.003 293.336,102.804 293.479,102.914 293.658 C 103.288 294.263,102.187 293.849,101.351 293.071 C 100.726 292.488,100.363 292.381,99.883 292.637 C 99.533 292.824,98.666 292.978,97.956 292.978 C 96.498 292.978,95.165 293.557,95.474 294.056 C 95.586 294.238,95.405 295.157,95.071 296.097 C 94.028 299.034,95.001 301.164,96.641 299.533 C 98.170 298.013,98.554 297.745,101.039 296.462 C 102.276 295.823,103.369 295.217,103.467 295.115 C 103.564 295.014,104.084 294.880,104.622 294.818 C 105.628 294.701,105.875 295.050,105.239 295.686 C 104.803 296.121,104.341 300.821,104.428 303.937 C 104.496 306.395,104.913 307.200,106.119 307.200 C 106.841 307.200,108.800 310.170,108.800 311.266 C 108.800 311.443,109.320 312.719,109.956 314.102 L 111.111 316.617 111.339 314.486 C 111.465 313.314,111.594 310.756,111.626 308.800 C 111.723 302.966,112.450 300.777,113.496 303.172 C 113.737 303.725,114.299 304.530,114.745 304.961 C 115.191 305.391,115.558 306.111,115.561 306.561 C 115.565 307.219,115.634 307.274,115.911 306.844 C 116.588 305.797,116.314 303.626,115.363 302.496 C 113.519 300.304,116.113 299.577,119.178 301.425 C 120.923 302.478,123.631 302.680,124.489 301.822 C 125.344 300.967,126.818 300.751,126.610 301.511 C 125.849 304.296,126.149 304.716,128.349 303.949 C 129.352 303.599,129.563 303.630,129.863 304.164 C 130.740 305.731,134.186 308.600,134.958 308.407 C 135.539 308.261,135.925 308.479,136.490 309.273 C 136.949 309.917,137.882 310.550,138.865 310.885 C 139.756 311.189,140.968 311.844,141.558 312.341 C 142.149 312.838,142.881 313.244,143.184 313.244 C 143.488 313.244,144.356 313.804,145.113 314.489 C 146.129 315.406,146.814 315.733,147.722 315.733 C 148.611 315.733,149.257 316.030,150.044 316.800 C 150.645 317.387,151.384 317.867,151.688 317.867 C 152.135 317.867,152.195 318.137,152.002 319.279 C 151.751 320.763,152.945 322.489,154.223 322.489 C 154.526 322.489,154.662 322.700,154.549 322.994 C 154.339 323.541,155.444 324.899,156.826 325.793 C 157.356 326.136,159.403 326.528,162.133 326.810 C 164.578 327.062,166.305 327.323,165.972 327.390 C 165.639 327.457,165.268 327.822,165.148 328.201 C 165.028 328.579,164.815 328.889,164.674 328.889 C 164.421 328.889,164.297 329.595,164.223 331.469 C 164.147 333.386,165.230 333.844,169.958 333.895 C 171.423 333.911,173.662 334.146,174.933 334.418 C 176.204 334.689,177.804 334.971,178.489 335.043 C 179.453 335.145,179.333 335.188,177.956 335.234 C 176.119 335.294,172.479 336.574,171.319 337.568 C 170.956 337.879,170.411 338.133,170.108 338.133 C 169.806 338.133,168.156 338.607,166.442 339.186 C 164.729 339.764,162.658 340.345,161.841 340.476 C 157.259 341.208,164.760 341.757,175.644 341.486 C 179.653 341.386,184.053 341.449,185.422 341.626 C 186.791 341.803,188.231 341.833,188.622 341.693 C 189.013 341.552,190.293 341.565,191.467 341.720 C 196.537 342.393,198.193 342.416,199.301 341.827 C 200.304 341.294,200.723 341.308,205.306 342.015 C 210.517 342.819,211.677 342.789,208.835 341.924 C 205.814 341.004,204.293 340.220,203.303 339.073 C 201.571 337.064,202.468 335.981,204.549 337.569 C 205.214 338.075,206.225 338.489,206.799 338.489 C 207.372 338.489,208.202 338.741,208.643 339.050 C 209.083 339.359,210.279 339.879,211.300 340.206 C 213.569 340.933,214.234 342.574,212.377 342.863 C 211.827 342.949,212.098 342.959,212.978 342.885 C 213.858 342.811,215.858 342.445,217.422 342.072 C 219.675 341.535,222.226 341.348,229.689 341.173 C 234.871 341.052,241.751 340.865,244.978 340.758 C 251.214 340.551,256.616 341.187,257.683 342.255 C 258.645 343.217,263.111 340.444,263.111 338.885 C 263.111 338.697,263.471 338.090,263.911 337.536 C 264.917 336.268,265.458 335.397,266.079 334.044 C 266.348 333.458,266.911 332.673,267.329 332.300 C 267.747 331.928,268.089 331.403,268.089 331.134 C 268.089 330.865,268.329 330.552,268.622 330.440 C 268.916 330.327,269.156 330.012,269.156 329.740 C 269.156 329.467,269.515 328.885,269.955 328.445 C 270.713 327.687,271.386 326.634,272.401 324.622 C 272.647 324.133,273.037 323.493,273.268 323.200 C 273.499 322.907,273.881 322.067,274.116 321.333 C 274.351 320.600,274.684 320.000,274.856 320.000 C 275.027 320.000,275.273 319.400,275.401 318.667 C 275.529 317.933,275.937 316.804,276.306 316.157 C 276.675 315.511,276.978 314.520,276.978 313.955 C 276.978 313.362,277.255 312.733,277.635 312.465 C 277.996 312.209,278.411 311.360,278.556 310.578 C 278.702 309.796,279.035 308.756,279.298 308.267 C 280.372 306.265,281.600 303.155,281.596 302.446 C 281.594 302.030,281.900 300.729,282.275 299.556 C 284.277 293.299,285.026 281.700,283.756 276.622 C 283.436 275.342,283.238 272.070,283.182 267.150 L 283.097 259.633 281.726 258.365 C 280.972 257.667,279.916 256.910,279.378 256.682 C 278.840 256.455,278.400 256.049,278.400 255.779 C 278.400 255.460,277.984 255.289,277.209 255.289 C 276.174 255.289,275.943 255.115,275.439 253.956 C 274.575 251.972,271.230 247.774,268.000 244.622 C 266.876 243.524,265.956 242.447,265.956 242.228 C 265.956 241.493,258.286 233.600,257.572 233.600 C 256.531 233.600,253.256 230.075,252.807 228.471 C 252.562 227.596,252.061 226.607,251.692 226.274 C 251.324 225.940,251.022 225.462,251.022 225.210 C 251.022 224.725,249.631 222.171,249.200 221.863 C 249.060 221.763,248.834 221.237,248.697 220.693 C 248.560 220.149,247.988 219.242,247.424 218.679 C 246.861 218.116,246.400 217.488,246.400 217.284 C 246.400 217.081,246.084 216.745,245.697 216.538 C 245.310 216.331,244.852 215.645,244.678 215.014 L 244.362 213.867 244.104 214.819 C 243.789 215.986,243.126 216.284,242.257 215.649 C 241.625 215.187,241.630 215.130,242.401 214.088 C 243.420 212.709,243.410 212.121,242.357 211.641 C 241.893 211.430,241.403 210.816,241.268 210.277 C 241.132 209.738,240.472 208.469,239.800 207.456 C 239.128 206.444,238.578 205.424,238.578 205.191 C 238.578 204.495,236.708 203.090,235.467 202.854 C 234.831 202.733,234.311 202.497,234.311 202.330 C 234.311 202.162,233.471 201.462,232.444 200.775 C 231.418 200.088,230.299 199.192,229.959 198.785 C 229.582 198.333,228.919 198.044,228.261 198.044 C 227.464 198.044,227.102 197.832,226.873 197.230 C 226.702 196.782,226.304 196.201,225.988 195.938 C 225.551 195.576,225.510 195.345,225.814 194.978 C 226.596 194.036,226.291 191.229,225.201 189.321 C 223.099 185.645,222.282 185.042,219.852 185.375 C 218.595 185.548,218.165 185.454,217.594 184.883 C 216.717 184.006,215.949 183.997,213.985 184.837 C 212.495 185.475,210.844 185.300,210.844 184.504 C 210.844 184.353,210.589 183.973,210.276 183.660 C 209.755 183.139,209.783 183.031,210.617 182.375 C 212.161 181.161,209.981 178.926,206.756 178.417 C 206.278 178.342,206.007 177.981,205.931 177.317 C 205.804 176.215,207.145 176.219,208.420 177.325 C 208.952 177.786,209.386 177.665,212.396 176.210 C 216.217 174.364,220.076 173.858,220.100 175.200 C 220.131 176.876,221.867 177.690,221.867 176.029 C 221.867 174.458,222.213 173.867,223.133 173.867 C 223.807 173.867,224.013 173.625,224.203 172.611 C 224.405 171.536,224.547 171.389,225.197 171.585 C 226.653 172.023,226.674 172.425,225.301 173.557 C 223.997 174.632,223.422 177.341,224.528 177.200 C 224.926 177.149,226.489 174.339,226.489 173.674 C 226.489 173.435,226.809 173.155,227.200 173.053 C 228.146 172.805,228.112 172.089,227.154 172.089 C 226.469 172.089,226.413 171.939,226.573 170.520 C 226.748 168.973,226.733 168.947,225.553 168.726 C 224.507 168.530,224.356 168.365,224.356 167.427 C 224.356 166.477,224.448 166.381,225.156 166.597 C 226.211 166.921,226.844 167.449,226.844 168.005 C 226.844 168.777,227.875 168.910,228.261 168.189 C 228.459 167.818,228.969 167.404,229.395 167.269 C 232.363 166.327,232.997 162.044,230.454 160.111 C 229.740 159.568,228.827 158.771,228.424 158.340 C 227.902 157.779,227.192 157.524,225.935 157.445 C 224.492 157.353,224.196 157.222,224.282 156.711 C 224.349 156.314,224.156 156.085,223.749 156.078 C 223.398 156.071,222.810 155.838,222.442 155.559 C 221.862 155.120,221.639 155.122,220.771 155.571 C 219.610 156.171,218.311 156.253,218.311 155.726 C 218.311 155.526,218.711 155.180,219.200 154.958 C 220.677 154.284,220.352 153.378,218.690 153.537 C 216.077 153.786,214.085 152.768,215.480 151.896 C 216.709 151.129,216.152 150.792,212.163 149.892 C 211.617 149.769,211.267 149.513,211.384 149.323 C 211.640 148.909,211.388 148.879,208.178 148.939 C 205.164 148.996,205.036 149.034,201.889 150.818 C 198.234 152.889,194.635 153.178,193.177 151.517 C 192.638 150.903,192.071 150.400,191.917 150.400 C 191.763 150.400,190.398 149.215,188.885 147.767 C 186.021 145.025,182.978 142.578,182.434 142.578 C 182.260 142.578,181.626 142.018,181.025 141.333 C 180.425 140.649,179.780 140.089,179.594 140.089 C 179.407 140.089,178.789 139.623,178.220 139.054 C 177.651 138.485,176.527 137.822,175.722 137.581 C 174.695 137.273,174.226 136.923,174.151 136.407 C 174.077 135.895,173.687 135.598,172.874 135.433 C 172.231 135.302,171.418 134.936,171.069 134.620 C 170.719 134.303,170.245 134.044,170.016 134.044 C 169.787 134.044,169.600 133.790,169.600 133.478 C 169.600 132.572,168.216 131.055,167.013 130.642 C 166.359 130.417,165.679 129.813,165.353 129.168 C 164.829 128.131,164.672 128.067,162.336 127.933 C 160.980 127.855,159.814 127.621,159.745 127.413 C 159.191 125.751,156.063 125.954,154.732 127.738 C 154.474 128.084,153.754 128.585,153.132 128.852 C 152.509 129.119,151.451 129.837,150.780 130.447 C 150.110 131.057,149.355 131.556,149.104 131.556 C 148.853 131.556,148.476 131.876,148.267 132.267 C 148.057 132.658,147.739 132.978,147.559 132.978 C 147.227 132.978,145.237 134.204,143.685 135.365 C 143.218 135.714,142.152 136.680,141.316 137.511 C 140.481 138.342,139.542 139.022,139.232 139.022 C 138.921 139.022,138.347 139.342,137.956 139.733 C 137.564 140.124,136.964 140.447,136.622 140.450 C 135.740 140.457,133.388 141.314,132.895 141.807 C 132.326 142.376,130.444 142.329,129.580 141.724 C 129.188 141.450,128.153 141.035,127.279 140.802 C 126.404 140.569,125.449 140.172,125.156 139.919 C 124.862 139.666,123.724 139.053,122.626 138.557 C 121.528 138.060,120.539 137.417,120.428 137.127 C 120.317 136.837,119.775 136.501,119.224 136.380 C 118.284 136.173,117.601 135.380,116.308 132.996 C 115.573 131.639,114.762 130.799,113.849 130.450 C 113.400 130.278,112.795 129.570,112.505 128.876 C 112.215 128.181,111.750 127.526,111.473 127.420 C 111.195 127.313,110.777 126.640,110.543 125.924 C 110.310 125.208,109.822 124.241,109.459 123.774 C 109.097 123.308,108.800 122.724,108.800 122.476 C 108.800 122.229,108.402 121.170,107.915 120.124 C 107.242 118.680,107.028 117.632,107.026 115.768 C 107.023 113.825,106.820 112.898,106.054 111.323 C 105.148 109.461,105.091 109.065,105.166 105.156 C 105.253 100.640,104.663 99.381,103.915 102.489 L 103.552 104.000 103.509 102.510 C 103.486 101.690,103.595 100.940,103.752 100.843 C 103.909 100.746,103.944 99.897,103.829 98.956 C 103.683 97.763,103.778 96.992,104.141 96.409 C 104.751 95.430,104.753 86.670,104.144 85.066 C 103.946 84.546,103.875 83.554,103.985 82.860 C 104.214 81.422,103.672 80.118,103.275 81.152 M184.356 83.935 C 183.769 84.311,183.471 84.619,183.694 84.620 C 183.917 84.621,184.477 84.308,184.938 83.923 C 185.995 83.042,185.741 83.048,184.356 83.935 M168.546 86.237 C 169.322 87.173,168.467 87.617,166.948 87.068 C 165.774 86.644,165.708 86.554,166.270 86.143 C 167.104 85.534,167.992 85.570,168.546 86.237 M167.180 88.468 C 167.488 88.897,168.092 89.112,168.978 89.108 C 170.811 89.100,171.139 89.566,170.159 90.785 C 168.831 92.435,166.217 91.892,165.899 89.900 C 165.573 87.859,166.221 87.135,167.180 88.468 M174.909 89.181 C 174.658 89.888,174.131 90.498,173.595 90.702 C 172.724 91.034,172.704 91.114,172.898 93.610 C 173.193 97.403,173.347 97.641,174.659 96.329 C 175.743 95.245,175.889 93.710,175.102 91.660 C 174.954 91.275,175.124 91.010,175.619 90.853 C 176.478 90.580,176.572 89.670,175.842 88.690 C 175.350 88.030,175.309 88.051,174.909 89.181 M159.442 93.906 C 159.136 94.402,160.061 95.014,160.482 94.594 C 160.824 94.252,160.494 93.511,160.000 93.511 C 159.828 93.511,159.576 93.689,159.442 93.906 M157.067 95.051 C 156.634 96.108,156.743 99.513,157.185 98.754 C 157.385 98.411,157.500 97.291,157.441 96.265 C 157.369 95.016,157.245 94.615,157.067 95.051 M100.522 97.328 C 100.440 97.869,100.371 97.511,100.368 96.533 C 100.366 95.556,100.433 95.113,100.517 95.551 C 100.601 95.988,100.604 96.788,100.522 97.328 M100.526 103.378 C 100.449 104.111,100.386 103.511,100.386 102.044 C 100.386 100.578,100.449 99.978,100.526 100.711 C 100.602 101.444,100.602 102.644,100.526 103.378 M93.262 106.572 C 93.033 108.954,92.802 109.525,92.431 108.622 C 92.023 107.630,92.028 106.519,92.444 105.424 C 92.981 104.011,93.446 104.663,93.262 106.572 M123.006 106.153 C 122.655 106.575,122.679 106.802,123.123 107.296 C 123.428 107.634,123.793 108.372,123.934 108.935 C 124.074 109.499,124.488 110.038,124.854 110.133 C 125.220 110.229,125.610 110.671,125.722 111.115 C 125.961 112.067,127.945 112.657,128.415 111.915 C 128.885 111.175,128.550 110.773,127.173 110.426 C 126.046 110.142,125.867 109.956,125.867 109.069 C 125.867 107.085,123.898 105.078,123.006 106.153 M154.844 110.140 C 154.453 110.224,153.787 110.612,153.363 111.003 C 152.809 111.514,151.864 111.777,149.986 111.945 C 145.477 112.348,146.983 113.702,152.000 113.756 C 154.013 113.778,155.874 112.861,156.178 111.697 C 156.427 110.744,155.744 109.946,154.844 110.140 M91.682 112.455 C 91.166 114.824,91.080 114.816,91.050 112.401 C 91.027 110.507,91.103 110.202,91.515 110.544 C 91.895 110.860,91.934 111.299,91.682 112.455 M124.681 112.237 C 124.338 112.580,124.401 113.869,124.791 114.486 C 125.345 115.363,125.980 114.392,125.697 113.102 C 125.460 112.022,125.155 111.763,124.681 112.237 M129.067 113.012 C 129.067 113.177,129.372 113.589,129.746 113.927 C 130.119 114.265,130.522 114.929,130.641 115.404 C 130.819 116.111,131.082 116.267,132.096 116.267 C 133.686 116.267,133.661 116.150,131.677 114.276 C 130.136 112.820,129.067 112.302,129.067 113.012 M90.311 116.622 C 90.311 117.676,89.769 118.373,89.523 117.634 C 89.290 116.937,89.659 115.195,89.995 115.402 C 90.169 115.510,90.311 116.059,90.311 116.622 M126.222 115.382 C 126.222 115.743,128.263 117.689,128.642 117.689 C 128.830 117.689,129.072 118.025,129.179 118.436 C 129.286 118.847,129.530 119.086,129.720 118.969 C 130.251 118.641,129.751 117.260,129.033 117.072 C 128.682 116.980,128.347 116.562,128.287 116.142 C 128.187 115.443,126.222 114.720,126.222 115.382 M139.022 115.549 C 139.022 116.071,140.665 116.381,141.778 116.070 L 142.756 115.796 141.689 115.540 C 140.084 115.155,139.022 115.159,139.022 115.549 M143.881 115.793 C 143.318 116.356,143.686 117.594,144.533 117.980 C 146.213 118.745,145.249 119.452,142.510 119.462 C 141.788 119.464,141.099 119.627,140.978 119.822 C 140.857 120.018,140.167 120.194,139.446 120.214 L 138.133 120.250 139.280 120.619 C 140.615 121.047,141.026 121.952,140.372 123.023 C 139.969 123.685,140.010 123.860,140.698 124.425 L 141.484 125.070 140.753 125.732 L 140.021 126.394 140.855 126.607 C 141.314 126.724,142.126 126.603,142.661 126.338 C 143.195 126.072,144.363 125.755,145.255 125.632 C 146.585 125.450,146.977 125.220,147.423 124.358 C 147.859 123.514,148.144 123.339,148.861 123.476 C 149.652 123.628,149.736 123.546,149.588 122.770 C 149.455 122.076,149.652 121.753,150.532 121.226 C 154.597 118.789,154.207 116.909,149.531 116.399 C 147.823 116.213,147.532 116.272,147.319 116.848 C 146.757 118.368,145.778 118.211,145.778 116.601 C 145.778 115.581,144.597 115.077,143.881 115.793 M153.529 115.982 C 153.861 116.314,154.050 116.314,154.382 115.982 C 154.714 115.650,154.619 115.556,153.956 115.556 C 153.292 115.556,153.197 115.650,153.529 115.982 M133.867 116.978 C 133.725 117.207,133.769 117.555,133.964 117.751 C 134.201 117.988,134.406 117.967,134.578 117.689 C 134.720 117.459,134.676 117.111,134.480 116.916 C 134.243 116.679,134.039 116.699,133.867 116.978 M135.467 118.749 C 135.467 118.948,135.973 119.111,136.593 119.111 C 137.887 119.111,137.840 118.956,136.444 118.621 C 135.864 118.482,135.467 118.534,135.467 118.749 M157.511 127.879 C 157.511 128.192,155.326 130.133,154.974 130.133 C 154.823 130.133,154.299 130.533,153.810 131.022 C 153.321 131.511,152.674 131.911,152.372 131.911 C 152.069 131.911,151.822 132.068,151.822 132.260 C 151.822 132.561,150.458 133.933,145.364 138.756 C 144.796 139.293,144.106 139.733,143.830 139.733 C 143.555 139.733,143.120 140.015,142.865 140.360 C 142.132 141.349,137.182 142.629,136.756 141.940 C 136.637 141.747,137.098 141.484,137.781 141.356 C 138.475 141.226,139.022 140.911,139.022 140.641 C 139.022 140.376,139.504 139.990,140.094 139.785 C 140.683 139.580,141.603 138.945,142.138 138.375 C 142.673 137.806,143.991 136.756,145.067 136.044 C 146.142 135.331,147.335 134.510,147.717 134.219 C 148.099 133.927,148.520 133.689,148.653 133.689 C 148.786 133.689,148.973 133.391,149.068 133.028 C 149.163 132.664,149.694 132.253,150.249 132.114 C 150.803 131.975,151.473 131.552,151.738 131.175 C 152.002 130.798,152.376 130.489,152.568 130.489 C 152.960 130.489,154.812 129.215,155.798 128.267 C 156.431 127.658,157.511 127.414,157.511 127.879 M165.618 131.271 C 165.852 131.506,166.044 131.555,166.044 131.381 C 166.044 131.009,167.083 132.318,167.100 132.711 C 167.132 133.470,165.291 132.912,164.969 132.066 C 164.453 130.708,164.723 130.377,165.618 131.271 M71.550 133.120 C 71.975 133.757,71.858 135.111,71.378 135.116 C 71.133 135.119,70.587 135.214,70.164 135.327 C 69.026 135.632,68.552 134.534,69.178 133.044 C 69.678 131.854,70.728 131.888,71.550 133.120 M45.689 136.178 C 45.517 136.456,45.312 136.477,45.075 136.240 C 44.880 136.044,44.836 135.696,44.978 135.467 C 45.150 135.188,45.354 135.168,45.591 135.405 C 45.787 135.600,45.831 135.948,45.689 136.178 M67.260 135.941 C 67.522 136.410,67.867 136.532,68.487 136.377 C 69.084 136.227,69.414 136.330,69.560 136.711 C 69.711 137.104,69.899 137.157,70.211 136.898 C 71.733 135.635,74.112 137.649,73.430 139.621 C 73.350 139.853,73.475 140.121,73.709 140.216 C 73.953 140.315,73.886 140.400,73.549 140.416 C 73.228 140.432,72.873 140.684,72.760 140.978 C 72.648 141.271,72.333 141.511,72.060 141.511 C 70.913 141.511,71.514 145.020,72.706 145.282 C 73.290 145.411,73.958 145.775,74.192 146.091 C 74.580 146.617,74.637 146.613,74.857 146.044 C 75.328 144.829,78.348 146.674,78.151 148.056 C 77.987 149.202,77.019 148.939,76.638 147.644 C 76.290 146.462,75.924 146.266,75.072 146.806 C 74.365 147.254,74.890 149.833,75.944 151.086 C 76.830 152.139,77.064 153.395,76.444 153.778 C 75.860 154.139,76.041 155.224,76.800 155.911 C 78.429 157.385,77.761 158.463,75.329 158.288 C 73.590 158.162,73.082 158.245,72.830 158.695 C 72.656 159.006,71.918 159.361,71.190 159.483 C 68.693 159.904,68.414 160.033,69.130 160.433 C 70.127 160.991,72.814 160.441,73.073 159.625 C 73.493 158.302,75.136 158.934,75.434 160.533 C 75.532 161.065,75.852 161.248,76.699 161.257 C 77.930 161.270,78.588 161.670,78.027 162.064 C 77.041 162.755,76.745 164.373,77.386 165.562 C 78.004 166.710,78.001 166.745,77.185 167.613 C 76.729 168.099,76.386 168.864,76.422 169.315 C 76.698 172.692,76.650 172.947,75.644 173.433 C 74.773 173.854,74.667 174.097,74.667 175.664 C 74.667 176.631,74.511 177.422,74.320 177.422 C 74.130 177.422,73.714 177.926,73.395 178.541 C 72.954 179.393,72.745 179.542,72.512 179.166 C 72.096 178.492,72.510 177.024,73.304 176.365 C 74.413 175.444,74.589 172.618,73.572 172.074 C 72.971 171.752,72.709 171.741,72.611 172.033 C 72.538 172.254,72.175 172.797,71.806 173.240 L 71.135 174.044 71.123 172.027 C 71.113 170.405,70.937 169.803,70.222 168.954 C 69.733 168.373,69.333 167.635,69.333 167.315 C 69.333 166.995,69.089 166.640,68.791 166.525 C 68.009 166.225,68.754 165.439,70.100 165.143 L 71.173 164.908 69.987 164.095 C 69.334 163.649,68.435 162.784,67.989 162.175 C 67.295 161.226,66.955 161.067,65.619 161.067 C 64.020 161.067,63.622 160.712,63.922 159.556 C 64.044 159.082,64.456 158.933,65.641 158.933 C 67.132 158.933,67.200 158.887,67.200 157.879 C 67.200 156.766,66.178 154.228,65.636 153.997 C 64.786 153.635,63.289 151.840,63.289 151.182 C 63.289 150.775,63.129 150.343,62.933 150.222 C 62.738 150.101,62.578 149.623,62.578 149.159 C 62.578 147.972,61.159 145.899,60.008 145.404 C 59.106 145.016,59.075 144.934,59.563 144.237 C 60.552 142.824,60.250 141.677,58.790 141.307 C 56.154 140.639,56.296 138.865,59.055 137.994 C 61.053 137.364,61.036 137.384,60.249 136.514 C 59.236 135.394,60.099 135.068,63.759 135.187 C 66.365 135.272,66.956 135.399,67.260 135.941 M38.851 139.761 C 39.507 140.059,39.659 140.360,39.546 141.132 C 39.419 141.995,39.539 142.148,40.491 142.338 C 41.759 142.592,42.261 143.832,41.597 145.071 C 41.260 145.701,40.972 145.812,40.116 145.641 C 39.531 145.524,38.756 145.587,38.392 145.782 C 37.580 146.216,37.163 145.675,37.266 144.322 C 37.305 143.803,37.098 142.919,36.804 142.356 C 35.532 139.916,36.499 138.689,38.851 139.761 M127.004 141.938 C 126.673 142.270,126.483 142.270,126.151 141.938 C 125.819 141.606,125.914 141.511,126.578 141.511 C 127.241 141.511,127.336 141.606,127.004 141.938 M173.202 143.787 C 173.539 145.046,173.254 145.778,172.427 145.778 C 171.257 145.778,170.897 144.137,171.821 143.010 C 172.361 142.352,172.900 142.655,173.202 143.787 M48.711 143.467 C 48.711 143.760,48.561 144.000,48.377 144.000 C 47.928 144.000,47.607 143.445,47.891 143.161 C 48.292 142.760,48.711 142.917,48.711 143.467 M132.089 143.289 C 132.222 143.504,131.737 143.644,130.865 143.644 C 130.072 143.644,129.422 143.484,129.422 143.289 C 129.422 143.093,129.973 142.933,130.646 142.933 C 131.319 142.933,131.968 143.093,132.089 143.289 M155.888 144.673 C 156.122 145.053,154.428 145.536,153.933 145.231 C 153.744 145.113,153.680 144.869,153.793 144.687 C 154.054 144.264,155.629 144.254,155.888 144.673 M142.578 148.110 C 142.578 148.392,142.338 148.622,142.044 148.622 C 141.509 148.622,141.314 147.872,141.738 147.447 C 142.070 147.115,142.578 147.516,142.578 148.110 M180.779 148.488 C 181.027 149.476,182.268 150.724,183.022 150.744 C 183.267 150.750,183.467 151.062,183.467 151.438 C 183.467 152.473,183.846 153.244,184.356 153.244 C 184.908 153.244,185.338 154.211,184.905 154.479 C 184.502 154.728,183.467 154.324,183.467 153.918 C 183.467 153.230,182.525 153.660,181.511 154.810 C 179.388 157.219,177.151 156.618,179.037 154.146 C 180.102 152.750,180.103 151.394,179.043 149.268 C 178.315 147.809,178.340 147.630,179.289 147.473 C 180.362 147.296,180.504 147.393,180.779 148.488 M61.538 152.178 C 61.808 154.755,62.156 155.664,62.972 155.923 C 64.209 156.316,63.914 158.933,62.632 158.933 C 60.716 158.933,58.629 157.526,59.315 156.696 C 60.459 155.311,60.198 153.699,58.723 153.049 C 57.328 152.433,56.574 151.197,57.087 150.367 C 57.208 150.171,58.213 150.058,59.320 150.117 L 61.333 150.222 61.538 152.178 M145.157 150.489 C 145.384 151.163,145.036 152.178,144.577 152.178 C 144.041 152.178,143.207 150.821,143.476 150.386 C 143.780 149.892,144.981 149.966,145.157 150.489 M176.211 151.200 C 176.902 153.330,176.688 153.956,175.270 153.956 C 173.756 153.956,173.228 152.969,173.857 151.314 C 174.314 150.112,175.835 150.039,176.211 151.200 M190.180 150.722 C 190.567 150.967,190.510 151.085,189.917 151.273 C 189.065 151.543,188.328 151.231,188.637 150.731 C 188.893 150.318,189.537 150.315,190.180 150.722 M208.518 150.731 C 208.631 150.913,208.552 151.167,208.344 151.296 C 207.818 151.621,206.840 151.195,207.110 150.758 C 207.387 150.308,208.247 150.292,208.518 150.731 M79.581 153.053 C 79.363 156.483,78.445 156.744,78.000 153.502 C 77.759 151.743,78.189 150.756,79.196 150.756 C 79.628 150.756,79.700 151.187,79.581 153.053 M143.242 155.446 C 143.798 157.750,143.785 159.397,143.220 158.400 C 142.998 158.009,142.443 157.337,141.986 156.906 C 141.071 156.043,140.848 154.049,141.585 153.313 C 142.201 152.696,142.750 153.402,143.242 155.446 M73.837 153.837 C 73.430 154.244,73.578 155.667,74.044 155.824 C 74.924 156.119,75.733 155.648,75.733 154.841 C 75.733 153.876,74.468 153.206,73.837 153.837 M159.644 156.934 C 159.644 158.775,159.270 159.133,157.216 159.255 C 155.429 159.362,155.492 158.831,157.477 157.064 C 158.082 156.525,158.578 155.925,158.578 155.731 C 158.578 155.537,158.818 155.378,159.111 155.378 C 159.504 155.378,159.644 155.788,159.644 156.934 M188.089 155.733 C 188.089 155.929,187.698 156.089,187.221 156.089 C 186.744 156.089,186.254 155.929,186.133 155.733 C 186.005 155.526,186.367 155.378,187.001 155.378 C 187.599 155.378,188.089 155.538,188.089 155.733 M88.534 157.840 C 91.174 158.412,93.973 159.125,94.756 159.424 C 95.538 159.724,96.607 159.976,97.132 159.984 C 97.765 159.995,98.161 160.239,98.311 160.711 C 98.468 161.204,98.849 161.422,99.554 161.422 C 100.215 161.422,100.815 161.733,101.270 162.311 C 101.654 162.800,102.299 163.200,102.702 163.200 C 103.536 163.200,105.244 164.755,105.244 165.515 C 105.244 165.792,105.564 166.191,105.956 166.400 C 106.347 166.609,106.667 166.940,106.667 167.135 C 106.667 167.834,109.225 170.032,110.423 170.363 C 111.095 170.548,111.644 170.850,111.644 171.032 C 111.644 174.043,120.258 176.920,123.712 175.063 C 124.754 174.503,126.025 173.822,126.537 173.551 C 127.741 172.913,132.109 169.703,133.488 168.444 C 134.077 167.906,136.255 166.516,138.329 165.355 C 140.402 164.194,142.309 162.990,142.567 162.679 C 142.913 162.263,143.596 162.132,145.177 162.179 C 147.174 162.239,147.388 162.166,148.335 161.106 C 149.472 159.834,149.886 159.893,150.212 161.376 C 150.334 161.933,150.998 163.251,151.686 164.305 C 152.826 166.051,152.922 166.397,152.766 168.178 C 152.284 173.660,151.755 176.897,151.112 178.309 C 150.721 179.169,150.397 180.481,150.393 181.225 C 150.382 183.391,149.718 187.463,149.187 188.622 C 148.918 189.209,148.358 192.249,147.943 195.378 C 147.528 198.507,147.030 202.267,146.836 203.733 C 146.643 205.200,146.485 207.097,146.487 207.949 C 146.488 208.800,146.265 210.400,145.992 211.504 C 145.719 212.608,145.406 215.708,145.297 218.394 C 145.188 221.079,144.918 223.613,144.698 224.025 C 144.478 224.436,144.076 227.679,143.806 231.231 C 142.804 244.384,143.406 243.387,136.831 242.792 C 132.520 242.401,131.761 242.418,130.076 242.935 C 124.127 244.764,121.832 244.718,116.428 242.661 C 113.931 241.711,111.182 241.945,110.222 243.191 C 109.543 244.073,106.756 244.580,106.511 243.867 C 106.418 243.598,106.170 240.338,105.959 236.622 C 105.748 232.907,105.354 229.067,105.085 228.089 C 104.816 227.111,104.491 225.111,104.364 223.644 C 104.236 222.178,103.822 219.742,103.444 218.232 C 103.065 216.721,102.756 214.959,102.756 214.315 C 102.756 213.672,102.437 212.551,102.048 211.825 C 101.659 211.099,101.194 209.901,101.015 209.164 C 99.991 204.953,99.097 202.212,98.026 200.000 C 97.363 198.631,96.714 196.951,96.584 196.267 C 96.453 195.582,95.725 193.742,94.966 192.178 C 94.206 190.613,93.467 188.933,93.321 188.444 C 93.176 187.956,92.760 187.174,92.396 186.708 C 92.031 186.241,91.733 185.675,91.733 185.449 C 91.733 185.223,91.198 184.005,90.543 182.742 C 89.889 181.478,89.255 180.041,89.135 179.548 C 89.015 179.056,88.619 178.333,88.255 177.943 C 87.892 177.553,87.415 176.720,87.196 176.091 C 86.977 175.463,86.463 174.590,86.054 174.150 C 85.644 173.711,84.929 172.547,84.464 171.565 C 83.998 170.582,83.105 169.399,82.478 168.936 C 81.200 167.992,81.217 168.661,82.291 161.422 C 82.893 157.364,83.035 156.800,83.456 156.800 C 83.609 156.800,85.894 157.268,88.534 157.840 M175.733 157.910 C 177.204 158.285,177.362 158.796,176.710 161.069 C 176.473 161.898,176.473 162.350,176.710 162.429 C 177.284 162.621,177.119 163.556,176.512 163.556 C 176.207 163.556,176.050 163.704,176.163 163.887 C 176.275 164.069,176.205 164.318,176.006 164.441 C 175.807 164.564,175.644 165.278,175.644 166.027 C 175.644 167.647,176.527 168.243,177.297 167.144 C 177.600 166.712,178.556 166.290,179.825 166.029 C 180.948 165.798,182.160 165.454,182.519 165.265 C 183.270 164.868,183.295 164.884,183.625 165.957 C 183.807 166.551,183.703 166.823,183.225 167.006 C 181.583 167.633,180.286 170.811,180.272 174.241 C 180.269 174.936,179.892 176.296,179.434 177.264 C 177.493 181.361,177.553 184.178,179.581 184.178 C 180.135 184.178,180.731 184.434,180.906 184.749 C 181.099 185.092,181.885 185.394,182.880 185.506 C 184.524 185.691,184.533 185.700,184.533 187.040 C 184.533 187.781,184.805 188.860,185.136 189.438 C 186.834 192.395,183.428 196.177,181.134 193.883 C 179.088 191.838,174.608 188.365,173.804 188.203 C 171.055 187.647,168.620 183.002,171.282 183.391 C 172.376 183.551,172.850 182.692,172.526 181.136 C 172.253 179.821,172.193 179.775,170.655 179.710 C 169.782 179.673,169.262 179.715,169.501 179.803 C 170.278 180.090,168.160 181.728,167.320 181.489 C 166.433 181.237,164.264 179.043,164.272 178.405 C 164.285 177.382,164.805 177.164,166.660 177.406 C 168.900 177.698,169.244 177.430,169.244 175.399 C 169.244 174.258,169.065 173.761,168.533 173.429 C 167.668 172.888,167.540 171.549,168.385 171.873 C 168.694 171.992,169.094 172.089,169.274 172.089 C 169.453 172.089,169.600 172.392,169.600 172.762 C 169.600 173.715,170.716 174.055,171.285 173.277 C 171.935 172.389,171.321 167.832,170.550 167.811 C 170.321 167.805,170.413 167.587,170.756 167.327 C 171.098 167.067,171.378 166.436,171.378 165.925 C 171.378 165.006,173.500 163.556,174.843 163.556 C 175.122 163.556,175.222 163.379,175.077 163.144 C 174.937 162.918,174.844 162.165,174.870 161.471 C 174.922 160.080,174.515 159.658,173.110 159.650 C 171.819 159.642,171.207 158.850,171.733 157.867 C 172.161 157.068,172.447 157.072,175.733 157.910 M167.042 159.874 C 167.544 160.008,167.790 160.282,167.676 160.580 C 167.573 160.848,167.671 161.067,167.893 161.067 C 168.115 161.067,168.189 161.174,168.058 161.304 C 167.928 161.435,168.033 161.795,168.292 162.104 C 169.868 163.986,169.753 168.131,168.136 167.708 C 167.718 167.599,167.415 167.779,167.276 168.219 C 167.157 168.593,166.911 168.807,166.730 168.695 C 166.548 168.583,166.400 168.741,166.400 169.046 C 166.400 169.892,165.722 169.706,165.281 168.739 C 165.051 168.233,164.688 167.956,164.400 168.066 C 164.131 168.169,163.911 168.067,163.911 167.839 C 163.911 167.611,163.748 167.526,163.548 167.649 C 163.349 167.772,162.686 167.453,162.076 166.940 C 161.466 166.427,160.762 166.085,160.511 166.182 C 159.889 166.420,159.513 164.028,159.820 161.791 C 159.985 160.596,160.249 159.991,160.653 159.884 C 161.582 159.637,166.134 159.630,167.042 159.874 M225.587 160.918 C 226.156 161.787,226.153 161.863,225.539 162.329 C 224.409 163.186,223.802 162.512,224.217 160.861 C 224.493 159.759,224.837 159.774,225.587 160.918 M27.200 162.311 C 27.200 163.319,27.107 163.388,25.511 163.572 C 23.604 163.791,23.495 163.614,24.612 162.103 C 25.703 160.627,27.200 160.748,27.200 162.311 M63.289 161.755 C 63.289 163.309,62.239 164.249,61.224 163.605 C 60.328 163.037,61.095 161.422,62.261 161.422 C 62.826 161.422,63.289 161.572,63.289 161.755 M227.911 161.944 C 227.911 162.262,227.703 162.387,227.378 162.262 C 227.084 162.149,226.844 161.914,226.844 161.740 C 226.844 161.565,227.084 161.422,227.378 161.422 C 227.671 161.422,227.911 161.657,227.911 161.944 M55.046 164.027 C 55.126 164.701,54.996 164.978,54.601 164.978 C 54.216 164.978,54.044 164.640,54.044 163.881 C 54.044 162.521,54.882 162.643,55.046 164.027 M230.133 163.567 C 229.693 163.743,229.333 164.133,229.333 164.433 C 229.333 164.777,229.006 164.978,228.444 164.978 C 227.952 164.978,227.556 164.772,227.556 164.516 C 227.556 163.700,228.375 163.199,229.671 163.223 C 230.785 163.242,230.839 163.283,230.133 163.567 M35.166 164.403 C 35.649 164.985,34.844 165.447,33.946 165.103 C 33.400 164.893,33.847 163.911,34.489 163.911 C 34.637 163.911,34.941 164.132,35.166 164.403 M67.556 165.156 C 67.556 165.449,67.316 165.689,67.022 165.689 C 66.729 165.689,66.489 165.817,66.489 165.973 C 66.489 166.129,65.918 166.463,65.221 166.716 C 64.524 166.968,63.867 167.399,63.762 167.674 C 63.493 168.374,62.933 167.934,62.933 167.024 C 62.933 165.684,64.297 164.622,66.018 164.622 C 67.148 164.622,67.556 164.764,67.556 165.156 M73.759 166.075 C 73.392 166.668,74.216 167.348,74.707 166.858 C 75.117 166.447,74.860 165.689,74.311 165.689 C 74.139 165.689,73.890 165.863,73.759 166.075 M221.855 167.274 C 222.304 167.816,222.067 169.781,221.461 170.536 C 221.252 170.796,221.330 171.013,221.680 171.147 C 222.390 171.420,222.402 173.464,221.696 173.735 C 221.407 173.846,220.476 173.601,219.628 173.191 C 218.780 172.780,217.697 172.439,217.221 172.433 C 216.322 172.421,212.780 171.298,212.380 170.899 C 211.768 170.286,213.797 169.273,215.240 169.470 C 216.613 169.658,216.801 169.574,218.059 168.213 C 219.500 166.654,221.027 166.277,221.855 167.274 M229.778 169.144 C 229.167 169.363,229.217 169.956,229.846 169.956 C 230.435 169.956,230.901 169.369,230.495 169.139 C 230.345 169.054,230.022 169.057,229.778 169.144 M65.246 170.669 C 65.368 170.866,65.177 171.134,64.823 171.265 C 64.468 171.396,64.060 171.675,63.917 171.885 C 63.773 172.095,63.653 171.827,63.650 171.289 C 63.644 170.289,64.747 169.861,65.246 170.669 M192.815 171.642 C 192.917 172.179,192.925 172.742,192.832 172.893 C 192.549 173.349,192.000 172.804,192.000 172.068 C 192.000 171.650,191.755 171.376,191.378 171.372 C 191.036 171.369,190.516 171.212,190.222 171.022 C 189.830 170.769,190.079 170.676,191.159 170.672 C 192.481 170.667,192.647 170.765,192.815 171.642 M163.907 173.522 L 163.441 174.646 163.015 173.634 C 162.432 172.251,162.989 171.015,163.821 171.846 C 164.293 172.319,164.306 172.558,163.907 173.522 M197.333 172.444 C 197.333 173.137,196.956 173.371,196.528 172.943 C 196.243 172.658,196.616 171.733,197.016 171.733 C 197.190 171.733,197.333 172.053,197.333 172.444 M66.117 174.380 C 66.697 175.080,66.447 176.500,65.719 176.639 C 65.070 176.762,64.775 175.947,65.005 174.667 C 65.172 173.742,65.514 173.654,66.117 174.380 M191.148 175.842 C 191.674 177.939,190.303 180.941,189.013 180.517 C 188.456 180.334,188.323 177.153,188.822 175.948 C 189.383 174.593,190.818 174.527,191.148 175.842 M68.838 175.911 C 69.528 176.820,69.435 177.697,68.622 177.956 C 68.097 178.122,67.911 178.494,67.911 179.373 C 67.911 180.947,67.600 181.689,66.938 181.689 C 66.365 181.689,66.400 176.651,66.980 175.712 C 67.362 175.095,68.295 175.195,68.838 175.911 M222.350 178.312 C 221.990 179.250,222.539 180.622,223.275 180.622 C 224.227 180.622,224.331 180.268,223.772 178.933 C 223.252 177.696,222.683 177.446,222.350 178.312 M201.980 181.416 C 202.903 181.750,201.800 182.464,200.763 182.203 C 199.967 182.004,199.822 181.773,199.822 180.710 L 199.822 179.452 200.647 180.341 C 201.100 180.831,201.700 181.314,201.980 181.416 M187.969 186.905 C 187.887 186.987,187.361 187.087,186.801 187.127 C 185.501 187.220,184.156 185.065,185.089 184.383 C 185.378 184.172,185.742 183.519,185.899 182.933 C 186.055 182.346,186.572 181.671,187.047 181.433 L 187.911 180.999 188.015 183.877 C 188.072 185.460,188.052 186.822,187.969 186.905 M71.995 182.750 C 72.422 183.221,72.898 183.389,73.434 183.254 C 74.031 183.104,74.402 183.294,74.895 184.001 C 75.258 184.522,76.236 185.740,77.067 186.708 C 77.898 187.676,78.578 188.724,78.578 189.037 C 78.578 189.864,79.979 192.000,80.521 192.000 C 81.285 192.000,82.029 193.495,82.295 195.564 C 82.757 199.154,83.141 199.822,84.740 199.822 L 86.138 199.822 85.946 198.388 C 85.814 197.407,85.456 196.719,84.814 196.214 C 83.903 195.498,83.894 195.453,84.513 194.769 C 85.772 193.378,89.244 194.625,89.244 196.468 C 89.244 196.921,89.704 197.656,90.298 198.157 C 91.144 198.868,91.421 199.479,91.708 201.258 C 91.904 202.476,92.310 203.744,92.610 204.076 C 93.821 205.414,93.217 207.008,91.859 206.057 C 91.450 205.771,91.015 205.637,90.891 205.761 C 90.768 205.884,90.666 205.679,90.665 205.304 C 90.662 204.230,89.953 201.956,89.622 201.956 C 88.974 201.956,88.992 204.632,89.649 206.022 C 90.013 206.792,90.311 207.721,90.311 208.085 C 90.311 208.492,90.757 208.943,91.467 209.253 C 93.954 210.341,95.644 212.829,95.644 215.403 C 95.644 216.681,95.713 216.777,96.510 216.625 C 97.277 216.478,97.420 216.634,97.772 218.008 C 98.199 219.675,98.312 219.981,98.806 220.800 C 99.695 222.276,101.089 227.373,101.346 230.087 C 101.506 231.772,101.817 233.821,102.037 234.638 C 102.257 235.456,102.507 236.670,102.592 237.336 C 102.677 238.002,103.069 239.074,103.461 239.718 C 104.304 241.100,104.365 242.299,103.663 243.644 C 103.220 244.494,103.220 244.751,103.663 245.600 C 103.944 246.138,104.174 246.827,104.176 247.132 C 104.177 247.437,104.413 247.997,104.700 248.376 C 105.248 249.102,105.464 252.800,104.957 252.800 C 104.799 252.800,104.390 253.434,104.048 254.210 C 103.454 255.557,101.434 256.574,100.736 255.877 C 100.622 255.762,100.217 256.063,99.838 256.545 C 99.459 257.028,98.800 257.423,98.374 257.424 C 97.948 257.426,97.133 257.670,96.562 257.968 C 95.941 258.292,94.261 258.562,92.384 258.641 L 89.244 258.772 89.195 257.475 C 88.953 251.107,89.966 248.940,90.502 254.679 C 90.769 257.534,91.382 258.481,92.650 257.994 C 93.464 257.682,93.317 252.295,92.444 250.489 C 92.067 249.707,91.750 248.347,91.740 247.467 C 91.717 245.381,91.509 245.156,89.600 245.156 C 87.489 245.156,87.111 245.458,87.111 247.144 C 87.111 247.920,86.861 249.151,86.555 249.878 C 86.249 250.605,85.856 252.445,85.681 253.966 C 85.286 257.394,85.267 257.423,83.446 257.417 C 80.965 257.408,80.561 256.323,81.591 252.442 C 81.758 251.811,81.586 251.187,81.001 250.309 C 79.689 248.339,80.812 246.172,82.757 246.919 C 83.032 247.024,83.601 246.871,84.020 246.577 C 84.776 246.047,84.773 246.040,83.609 245.600 C 82.769 245.283,82.379 244.875,82.237 244.162 L 82.038 243.166 81.243 243.913 L 80.448 244.659 80.229 243.841 C 79.655 241.697,80.148 239.806,81.179 240.202 C 82.661 240.771,82.758 236.714,81.278 236.039 C 80.517 235.693,79.551 234.190,79.139 232.710 C 78.930 231.959,80.095 229.689,80.689 229.689 C 81.252 229.689,81.774 227.197,81.770 224.533 C 81.767 221.888,81.611 221.417,80.622 221.052 C 79.821 220.756,79.763 217.779,80.531 216.307 C 80.823 215.747,81.063 214.607,81.064 213.774 C 81.066 212.702,81.274 212.082,81.778 211.651 C 82.625 210.925,82.766 208.548,81.987 208.107 C 81.711 207.950,81.342 207.262,81.166 206.578 C 80.758 204.986,79.609 204.704,78.998 206.045 C 78.349 207.470,78.484 207.870,79.733 208.227 C 81.113 208.620,81.418 209.844,80.555 211.514 C 80.250 212.104,79.998 213.195,79.995 213.938 C 79.992 214.681,79.848 215.512,79.675 215.785 C 79.239 216.473,78.222 216.003,78.222 215.113 C 78.222 214.711,77.902 213.472,77.511 212.359 C 77.120 211.246,76.800 209.898,76.800 209.363 C 76.800 208.828,76.554 208.253,76.254 208.085 C 75.841 207.854,75.700 207.109,75.675 205.034 C 75.649 202.734,75.535 202.230,74.977 201.932 C 74.611 201.735,74.310 201.301,74.309 200.965 C 74.305 199.825,73.563 197.670,73.242 197.868 C 73.066 197.977,72.746 197.413,72.531 196.615 C 72.316 195.816,71.909 195.075,71.626 194.966 C 71.343 194.857,71.111 194.328,71.111 193.789 C 71.111 191.735,70.647 189.511,70.218 189.511 C 69.976 189.511,69.679 189.018,69.559 188.416 C 69.438 187.813,69.018 186.911,68.625 186.412 C 67.506 184.989,67.790 182.201,69.015 182.589 C 69.378 182.705,69.958 182.634,70.304 182.432 C 71.170 181.929,71.268 181.947,71.995 182.750 M37.989 183.666 C 37.796 184.663,36.978 184.718,36.978 183.733 C 36.978 183.261,37.087 182.765,37.221 182.631 C 37.598 182.254,38.125 182.963,37.989 183.666 M70.170 184.007 C 69.785 185.010,70.414 189.156,70.952 189.156 C 71.252 189.156,71.671 189.962,72.014 191.200 C 72.327 192.324,72.640 193.429,72.711 193.655 C 72.783 193.881,73.305 194.168,73.873 194.293 L 74.904 194.520 74.874 197.852 C 74.841 201.596,74.929 201.807,76.333 201.344 C 78.472 200.639,78.993 197.080,77.272 194.932 C 76.257 193.665,75.511 192.427,73.197 188.170 C 72.560 186.998,72.178 185.764,72.178 184.881 C 72.178 183.378,70.664 182.720,70.170 184.007 M175.331 184.500 C 174.944 184.745,174.999 184.862,175.588 185.049 C 175.999 185.179,176.860 185.891,177.501 186.631 C 179.043 188.410,180.267 188.757,180.267 187.416 C 180.267 186.304,179.689 185.600,178.776 185.600 C 178.426 185.600,177.940 185.280,177.695 184.889 C 177.231 184.145,176.168 183.970,175.331 184.500 M201.956 184.391 C 201.956 184.508,201.476 185.052,200.889 185.600 L 199.822 186.596 199.822 185.595 C 199.822 185.043,200.022 184.512,200.267 184.413 C 200.907 184.155,201.956 184.141,201.956 184.391 M205.330 185.583 C 205.462 186.184,205.370 186.973,205.114 187.446 C 204.691 188.227,204.650 188.180,204.276 186.489 C 204.017 185.320,204.003 184.628,204.235 184.468 C 204.762 184.105,205.075 184.424,205.330 185.583 M208.711 186.421 C 208.711 187.184,207.784 188.217,207.343 187.944 C 206.507 187.428,206.862 185.956,207.822 185.956 C 208.318 185.956,208.711 186.162,208.711 186.421 M53.184 188.320 C 53.071 188.616,52.978 189.005,52.978 189.185 C 52.978 189.855,51.249 189.515,51.022 188.800 C 50.544 187.295,51.114 186.604,52.319 187.227 C 53.029 187.594,53.321 187.963,53.184 188.320 M48.711 189.153 C 48.711 190.179,48.878 190.583,49.367 190.738 C 49.813 190.880,50.159 191.552,50.446 192.838 C 50.750 194.195,51.218 195.067,52.102 195.923 C 52.779 196.580,53.333 197.334,53.333 197.599 C 53.333 197.863,53.603 198.592,53.933 199.218 C 54.263 199.844,54.647 201.285,54.786 202.421 C 54.925 203.557,55.280 204.757,55.576 205.087 C 55.872 205.418,56.374 206.589,56.692 207.690 C 57.009 208.790,57.584 209.975,57.968 210.322 C 58.821 211.095,58.855 211.824,58.078 212.683 C 57.301 213.542,56.676 213.503,55.676 212.533 C 55.223 212.093,54.390 211.488,53.826 211.187 C 53.262 210.887,52.480 210.004,52.089 209.225 C 51.546 208.143,51.199 207.836,50.621 207.924 C 50.064 208.008,49.806 207.805,49.642 207.154 C 49.520 206.667,48.959 205.941,48.394 205.539 C 47.080 204.603,46.737 203.296,47.501 202.131 C 48.054 201.287,46.795 200.178,45.284 200.178 C 44.646 200.178,43.733 198.903,43.733 198.014 C 43.733 197.322,43.413 196.798,42.667 196.267 C 41.756 195.618,41.600 195.277,41.600 193.930 C 41.600 193.032,41.294 191.781,40.889 191.026 C 39.943 189.262,39.987 188.917,41.236 188.271 C 42.421 187.658,42.388 187.606,42.806 190.711 C 43.029 192.366,43.622 193.076,45.701 194.179 C 48.285 195.550,48.979 194.163,48.196 189.191 C 47.973 187.771,48.001 187.336,48.303 187.523 C 48.527 187.662,48.711 188.395,48.711 189.153 M182.519 190.068 C 182.223 190.841,182.975 191.567,183.514 191.028 C 183.969 190.573,183.687 189.511,183.111 189.511 C 182.903 189.511,182.637 189.762,182.519 190.068 M25.669 190.872 C 25.924 191.230,26.616 191.689,27.206 191.892 C 27.796 192.095,28.860 192.842,29.570 193.553 C 30.281 194.263,31.139 194.844,31.477 194.844 C 31.815 194.844,32.727 195.418,33.503 196.120 C 34.279 196.821,35.386 197.559,35.963 197.760 C 36.709 198.020,37.072 198.426,37.220 199.164 C 37.334 199.736,37.766 200.381,38.180 200.597 C 40.591 201.860,41.600 203.050,41.600 204.628 C 41.600 205.795,41.753 206.219,42.222 206.355 C 42.564 206.454,43.524 206.711,44.356 206.926 C 45.926 207.332,46.104 207.603,45.518 208.699 C 45.257 209.187,45.306 209.404,45.711 209.559 C 46.388 209.819,47.442 212.257,47.047 212.647 C 46.887 212.805,45.558 213.064,44.093 213.223 C 41.268 213.529,40.621 214.081,41.757 215.217 C 42.466 215.926,46.589 216.387,47.561 215.867 C 48.209 215.520,48.304 215.613,48.527 216.808 C 48.850 218.538,49.288 219.022,50.526 219.022 C 51.347 219.022,51.582 219.209,51.748 220.000 C 51.862 220.538,52.185 221.503,52.466 222.145 C 53.618 224.774,51.033 227.151,47.529 226.686 C 43.902 226.204,43.566 226.239,43.442 227.111 C 43.379 227.551,43.491 227.911,43.689 227.911 C 43.887 227.911,44.656 228.467,45.397 229.146 C 46.138 229.825,47.203 230.481,47.764 230.604 C 48.325 230.727,49.069 231.114,49.418 231.463 C 49.941 231.986,50.325 232.044,51.604 231.797 C 54.086 231.318,54.538 231.401,55.133 232.447 C 55.558 233.193,56.340 233.642,58.459 234.356 C 61.805 235.484,61.561 235.710,56.700 235.985 C 51.559 236.276,51.359 236.793,55.822 238.260 C 57.093 238.678,58.621 239.480,59.217 240.043 C 59.813 240.606,60.641 241.067,61.056 241.067 C 62.044 241.067,63.795 242.558,64.333 243.858 C 64.568 244.423,65.148 245.063,65.624 245.280 C 67.270 246.029,66.447 246.846,63.637 247.253 C 62.500 247.418,61.827 247.338,61.338 246.981 C 60.854 246.627,60.397 246.571,59.812 246.793 C 58.492 247.295,57.530 247.169,56.696 246.386 C 55.350 245.121,51.556 244.999,51.556 246.221 C 51.556 247.234,53.308 247.954,55.952 248.026 C 57.347 248.064,59.049 248.338,59.733 248.635 C 60.418 248.932,61.938 249.292,63.111 249.435 C 66.183 249.810,66.844 250.125,66.844 251.215 C 66.844 252.266,67.320 253.276,68.257 254.213 C 68.614 254.569,69.018 255.374,69.156 256.001 C 69.316 256.730,69.777 257.353,70.434 257.726 C 71.070 258.088,71.463 258.605,71.464 259.082 C 71.468 260.228,71.835 260.978,72.394 260.978 C 73.034 260.978,73.031 261.676,72.389 262.183 C 71.385 262.976,71.343 264.726,72.314 265.362 L 73.194 265.939 72.452 267.295 L 71.709 268.650 69.154 268.636 C 67.502 268.627,66.393 268.793,66.015 269.107 C 65.694 269.373,64.525 269.773,63.418 269.995 C 62.052 270.270,61.279 270.629,61.013 271.111 C 60.798 271.502,60.581 271.891,60.530 271.974 C 60.479 272.058,58.879 272.258,56.974 272.418 C 52.359 272.808,49.936 273.206,49.362 273.669 C 49.102 273.879,48.369 274.162,47.734 274.298 C 47.098 274.434,46.360 274.858,46.093 275.239 C 45.763 275.709,45.014 276.003,43.774 276.150 C 42.325 276.322,41.615 276.654,40.383 277.739 C 39.526 278.494,38.649 279.111,38.434 279.111 C 38.220 279.111,37.699 279.457,37.277 279.879 C 36.855 280.301,35.784 280.782,34.898 280.947 C 33.262 281.253,31.644 282.404,31.644 283.262 C 31.644 283.576,31.162 283.733,30.199 283.733 C 27.950 283.733,27.378 284.202,27.378 286.044 C 27.378 287.317,27.224 287.700,26.578 288.037 C 25.541 288.579,22.400 291.909,22.400 292.466 C 22.400 292.703,22.026 293.141,21.570 293.440 C 21.113 293.739,20.273 294.485,19.703 295.097 C 19.133 295.710,18.153 296.459,17.526 296.761 C 16.899 297.064,16.019 297.673,15.571 298.116 C 15.122 298.558,14.147 299.032,13.404 299.169 C 12.660 299.305,11.967 299.638,11.863 299.909 C 11.728 300.261,11.378 300.064,10.637 299.220 C 9.472 297.894,9.197 295.443,10.099 294.428 C 10.373 294.119,10.855 292.587,11.168 291.022 C 12.350 285.127,12.775 283.598,13.313 283.297 C 13.617 283.126,13.867 282.703,13.867 282.355 C 13.867 282.008,14.282 281.336,14.789 280.862 C 15.880 279.843,16.711 278.348,16.711 277.405 C 16.711 276.963,17.196 276.512,18.114 276.098 C 21.072 274.764,23.882 270.551,23.381 268.203 C 23.013 266.476,23.491 264.642,24.195 265.077 C 24.398 265.203,24.780 265.127,25.043 264.909 C 25.322 264.677,26.537 264.553,27.961 264.611 L 30.400 264.711 30.512 263.137 C 30.576 262.242,30.935 261.169,31.345 260.648 C 31.741 260.145,32.274 259.233,32.529 258.622 C 32.886 257.767,33.311 257.435,34.363 257.186 C 37.120 256.534,36.308 255.134,33.100 255.006 C 29.736 254.871,29.186 255.052,30.053 256.010 C 30.782 256.815,30.801 256.784,29.201 257.422 C 28.416 257.735,27.834 258.301,27.517 259.060 C 26.796 260.785,25.747 261.375,23.830 261.134 C 22.228 260.932,22.217 260.938,20.776 262.829 C 19.609 264.360,18.996 264.827,17.600 265.252 C 14.283 266.260,13.031 270.222,16.029 270.222 C 16.404 270.222,16.711 270.382,16.711 270.578 C 16.711 270.774,15.777 270.933,14.621 270.933 C 13.169 270.933,12.392 271.101,12.075 271.483 C 11.410 272.285,10.963 271.435,11.215 269.850 C 11.372 268.864,11.256 268.445,10.686 267.928 C 10.284 267.565,9.952 266.852,9.948 266.345 C 9.943 265.837,9.608 264.702,9.202 263.822 C 8.797 262.942,8.415 261.582,8.355 260.800 C 8.294 260.018,8.142 258.120,8.018 256.584 C 7.750 253.289,8.149 252.388,10.171 251.721 C 11.298 251.349,11.522 251.369,11.801 251.867 C 12.024 252.265,12.616 252.444,13.707 252.444 C 15.659 252.444,15.733 251.988,13.897 251.254 C 12.655 250.756,11.174 249.330,11.531 248.973 C 11.696 248.807,20.007 248.558,29.652 248.428 C 35.033 248.356,36.836 248.443,37.183 248.789 C 37.846 249.453,38.169 249.364,39.411 248.178 C 40.568 247.072,41.335 246.928,43.853 247.344 C 47.307 247.915,46.074 250.783,42.533 250.418 L 40.634 250.222 39.962 251.597 C 39.592 252.353,38.930 253.148,38.491 253.362 C 37.308 253.941,36.267 254.973,36.267 255.568 C 36.267 256.692,39.246 255.863,41.576 254.091 C 44.164 252.123,45.122 252.011,45.867 253.590 C 46.246 254.395,47.037 255.042,48.610 255.837 C 49.826 256.451,51.467 257.401,52.256 257.948 C 53.562 258.853,53.891 258.925,55.898 258.743 C 58.353 258.520,61.553 259.560,63.289 261.144 C 64.787 262.510,70.563 263.210,70.926 262.069 C 71.320 260.828,70.552 260.309,68.148 260.194 C 65.564 260.070,65.147 259.316,67.321 258.699 C 68.732 258.298,68.750 257.778,67.352 257.778 C 66.914 257.778,65.881 257.213,65.055 256.524 C 63.378 255.122,62.567 255.128,61.272 256.549 C 59.456 258.544,53.918 257.964,55.258 255.920 C 55.834 255.040,55.824 254.986,54.949 254.298 C 54.452 253.907,54.044 253.280,54.044 252.904 C 54.044 252.026,52.449 250.525,50.790 249.843 C 49.983 249.512,49.406 248.994,49.266 248.477 C 48.164 244.391,48.999 244.817,41.105 244.309 C 36.348 244.002,35.297 244.027,34.456 244.461 C 33.904 244.747,32.490 244.978,31.295 244.978 C 29.754 244.978,29.078 245.123,28.939 245.483 C 28.248 247.285,15.513 247.475,12.683 245.727 C 11.370 244.915,10.097 244.780,6.400 245.061 L 5.156 245.156 5.267 241.244 C 5.395 236.766,5.775 235.905,7.957 235.150 C 8.699 234.893,9.651 234.361,10.075 233.968 C 12.440 231.772,15.489 230.167,17.874 229.861 C 18.885 229.731,19.836 229.358,20.227 228.939 C 20.661 228.473,21.711 228.107,23.330 227.858 C 26.571 227.359,26.667 227.253,26.667 224.165 L 26.667 221.574 28.122 221.328 C 30.011 221.009,33.260 221.420,33.777 222.044 C 34.000 222.312,34.654 222.636,35.231 222.762 C 35.893 222.908,36.476 223.374,36.815 224.030 C 37.352 225.067,39.475 225.561,39.968 224.763 C 40.282 224.255,38.647 222.998,37.511 222.873 C 36.647 222.778,36.423 222.570,36.332 221.778 C 36.258 221.136,36.010 220.800,35.611 220.800 C 35.277 220.800,34.582 220.320,34.067 219.733 C 33.193 218.737,32.965 218.667,30.617 218.667 C 29.135 218.667,27.516 218.432,26.672 218.094 C 25.350 217.565,25.171 217.566,24.343 218.109 C 23.850 218.432,23.315 218.615,23.154 218.516 C 22.994 218.416,22.096 218.264,21.160 218.176 C 19.683 218.038,18.869 217.577,18.850 216.867 C 18.847 216.757,19.329 216.309,19.921 215.871 C 20.583 215.382,20.895 214.911,20.732 214.649 C 20.305 213.963,20.629 212.506,21.391 211.683 C 22.075 210.944,21.305 209.422,20.247 209.422 C 19.678 209.422,22.413 206.932,22.998 206.917 C 23.743 206.899,25.980 205.939,25.380 205.896 C 25.161 205.880,24.887 205.347,24.771 204.711 C 24.656 204.076,24.456 203.196,24.328 202.756 C 24.137 202.100,24.234 201.956,24.868 201.956 C 25.314 201.956,25.545 201.799,25.413 201.586 C 25.288 201.382,24.900 201.306,24.551 201.417 C 24.048 201.576,23.877 201.365,23.719 200.390 C 23.459 198.786,23.762 197.700,24.486 197.644 C 27.011 197.446,27.733 197.184,27.733 196.464 C 27.733 196.169,27.349 195.675,26.878 195.367 C 26.408 195.059,25.925 194.415,25.805 193.937 C 25.649 193.316,25.342 193.067,24.733 193.067 C 22.955 193.067,21.763 191.038,23.200 190.458 C 24.155 190.072,25.225 190.252,25.669 190.872 M209.067 190.946 C 209.067 191.197,209.291 191.194,209.770 190.937 C 211.309 190.114,213.292 191.518,212.796 193.080 C 212.530 193.918,211.001 194.008,209.993 193.245 C 209.398 192.795,209.205 192.817,208.338 193.434 C 206.393 194.820,204.736 193.402,205.856 191.310 C 206.275 190.526,209.067 190.209,209.067 190.946 M195.982 193.896 C 195.982 195.312,195.668 196.022,195.175 195.718 C 194.795 195.483,194.722 192.596,195.087 192.231 C 195.532 191.786,195.982 192.624,195.982 193.896 M11.911 193.778 C 12.032 193.973,11.792 194.133,11.378 194.133 C 10.964 194.133,10.724 193.973,10.844 193.778 C 10.965 193.582,11.205 193.422,11.378 193.422 C 11.550 193.422,11.790 193.582,11.911 193.778 M198.885 195.633 C 198.580 196.127,198.063 195.564,198.287 194.981 C 198.453 194.550,198.561 194.529,198.782 194.887 C 198.937 195.138,198.984 195.474,198.885 195.633 M194.987 198.400 C 195.660 198.400,196.043 199.555,196.107 201.778 C 196.136 202.756,196.282 204.222,196.433 205.038 C 196.706 206.508,196.697 206.525,195.243 207.267 L 193.778 208.014 193.778 207.012 C 193.778 206.460,193.914 205.857,194.081 205.671 C 195.343 204.264,195.158 200.142,193.794 199.299 C 193.655 199.213,193.617 198.620,193.711 197.981 C 193.867 196.918,193.906 196.886,194.174 197.610 C 194.334 198.045,194.700 198.400,194.987 198.400 M49.693 198.311 C 49.603 198.849,49.464 199.509,49.386 199.778 C 49.308 200.047,49.444 200.340,49.689 200.430 C 50.004 200.545,50.133 200.117,50.133 198.963 C 50.133 197.131,49.941 196.845,49.693 198.311 M177.268 197.764 C 178.136 198.160,178.200 198.330,178.039 199.809 C 177.818 201.834,177.981 202.271,179.121 202.704 C 180.146 203.094,179.677 203.963,178.291 204.242 C 177.911 204.319,177.126 204.564,176.547 204.788 C 174.284 205.663,171.226 203.604,173.031 202.422 C 173.863 201.876,173.931 201.661,173.751 200.140 C 173.466 197.739,174.976 196.720,177.268 197.764 M211.556 198.377 C 211.556 198.560,211.385 199.158,211.177 199.706 L 210.798 200.703 210.169 199.870 C 209.217 198.608,208.218 198.984,208.000 200.685 C 207.689 203.116,204.083 203.846,202.061 201.886 C 200.628 200.496,200.603 200.074,201.898 199.152 C 202.890 198.446,203.328 198.389,209.867 198.115 C 210.796 198.076,211.556 198.194,211.556 198.377 M192.897 201.568 C 192.117 204.528,190.863 205.186,190.427 202.866 C 190.016 200.672,190.456 199.822,192.006 199.822 L 193.358 199.822 192.897 201.568 M186.667 202.323 C 186.667 203.159,184.680 204.327,184.428 203.639 C 184.234 203.111,185.937 201.191,186.366 201.456 C 186.531 201.558,186.667 201.948,186.667 202.323 M209.422 203.200 C 209.422 204.217,209.008 204.342,208.333 203.528 C 207.948 203.064,207.955 202.913,208.378 202.645 C 209.193 202.129,209.422 202.251,209.422 203.200 M169.727 208.147 C 169.267 209.623,168.866 207.678,169.130 205.256 L 169.393 202.844 169.666 205.156 C 169.816 206.427,169.844 207.773,169.727 208.147 M86.038 204.812 C 85.425 205.958,85.737 208.858,86.489 209.001 C 87.034 209.104,87.111 208.807,87.111 206.604 C 87.111 204.072,86.753 203.475,86.038 204.812 M214.479 205.518 C 214.555 206.197,214.395 206.424,213.778 206.512 C 213.141 206.604,212.978 206.455,212.978 205.785 C 212.978 203.995,214.281 203.763,214.479 205.518 M35.104 205.544 C 34.257 206.037,34.659 206.578,35.873 206.578 C 37.091 206.578,37.450 206.258,36.931 205.633 C 36.463 205.068,35.963 205.044,35.104 205.544 M73.384 206.429 C 73.503 206.738,73.600 207.281,73.600 207.635 C 73.600 207.990,73.840 208.372,74.133 208.484 C 74.511 208.629,74.667 209.218,74.667 210.499 C 74.667 212.414,74.168 212.623,73.783 210.870 C 73.658 210.301,73.246 209.479,72.867 209.041 C 72.054 208.105,71.918 205.867,72.673 205.867 C 72.945 205.867,73.265 206.120,73.384 206.429 M224.308 206.331 C 223.989 206.574,223.669 207.076,223.597 207.446 C 223.417 208.378,222.578 208.589,222.578 207.703 C 222.578 206.412,222.987 205.866,223.949 205.878 C 224.773 205.888,224.817 205.944,224.308 206.331 M229.007 207.289 C 229.681 207.289,229.300 208.256,228.480 208.630 C 227.773 208.952,227.599 208.916,227.471 208.421 C 227.235 207.511,227.568 206.862,228.155 207.087 C 228.444 207.198,228.827 207.289,229.007 207.289 M28.533 207.506 C 27.347 208.034,28.776 208.957,32.079 209.794 C 33.165 210.070,33.832 210.456,33.969 210.888 C 34.328 212.017,37.122 213.134,38.637 212.753 C 40.386 212.314,38.914 210.618,36.375 210.146 C 34.684 209.833,33.915 209.418,32.473 208.043 C 31.932 207.527,29.293 207.167,28.533 207.506 M211.556 207.623 C 211.556 208.104,210.907 208.436,210.483 208.174 C 210.284 208.051,210.214 207.802,210.326 207.620 C 210.593 207.188,211.556 207.191,211.556 207.623 M200.469 208.622 C 200.611 209.623,202.437 209.740,203.459 208.815 C 204.265 208.086,205.270 208.537,205.445 209.707 C 205.580 210.614,203.010 212.622,201.713 212.622 C 200.222 212.622,197.235 210.894,197.529 210.201 C 197.669 209.870,197.759 209.150,197.729 208.600 C 197.654 207.235,200.275 207.256,200.469 208.622 M177.359 209.182 C 177.464 210.095,177.384 210.175,176.471 210.071 C 175.667 209.979,175.444 209.755,175.352 208.952 C 175.247 208.038,175.327 207.958,176.241 208.063 C 177.044 208.155,177.267 208.379,177.359 209.182 M172.444 209.644 C 172.444 210.116,172.348 210.140,171.911 209.778 C 171.618 209.534,171.378 209.275,171.378 209.201 C 171.378 209.127,171.618 209.067,171.911 209.067 C 172.204 209.067,172.444 209.326,172.444 209.644 M168.950 210.366 C 169.491 210.856,169.600 211.510,169.600 214.277 C 169.600 217.639,170.499 219.098,171.203 216.879 C 171.329 216.483,171.811 215.910,172.275 215.606 C 172.924 215.181,173.144 214.677,173.226 213.421 C 173.360 211.384,174.059 211.077,174.757 212.749 C 175.377 214.232,175.150 215.046,173.996 215.485 C 173.312 215.745,173.156 216.061,173.156 217.181 C 173.156 218.105,172.922 218.768,172.444 219.200 C 171.520 220.037,171.539 221.436,172.488 222.446 C 173.447 223.468,173.182 226.260,172.068 226.855 C 171.272 227.281,170.157 229.333,169.785 231.058 C 169.643 231.714,169.231 232.547,168.869 232.909 C 168.260 233.517,168.178 234.493,168.502 237.244 C 168.519 237.391,168.755 237.511,169.026 237.511 C 169.655 237.511,170.133 240.457,169.646 241.328 C 169.202 242.121,168.438 240.399,168.590 238.949 C 168.844 236.528,166.481 236.358,165.504 238.726 C 164.508 241.142,162.508 241.267,162.494 238.914 C 162.491 238.414,162.089 237.463,161.600 236.800 C 160.684 235.558,160.369 233.143,161.067 232.711 C 161.262 232.590,161.422 231.483,161.422 230.251 C 161.422 228.409,161.590 227.764,162.368 226.627 C 163.268 225.310,164.267 222.674,164.267 221.614 C 164.267 221.342,163.710 220.887,163.030 220.603 C 161.560 219.989,161.859 218.473,163.528 218.076 C 165.069 217.709,165.333 217.275,165.333 215.108 C 165.333 212.669,165.994 210.915,167.154 210.272 C 168.232 209.674,168.183 209.672,168.950 210.366 M194.483 210.933 C 194.480 211.178,194.340 211.595,194.172 211.860 C 193.782 212.477,193.267 211.761,193.557 211.005 C 193.800 210.373,194.491 210.320,194.483 210.933 M67.911 212.606 C 67.911 212.778,67.997 213.144,68.103 213.419 C 68.366 214.104,66.730 214.854,66.177 214.301 C 65.659 213.783,65.665 212.522,66.188 211.999 C 66.626 211.560,67.911 212.013,67.911 212.606 M186.074 212.278 C 186.302 212.285,186.097 212.616,185.619 213.014 C 184.353 214.068,185.136 214.388,188.996 214.395 C 191.017 214.398,192.372 214.559,192.640 214.827 C 193.236 215.423,193.173 217.069,192.533 217.600 C 192.240 217.843,192.000 218.572,192.000 219.220 C 192.000 220.084,191.811 220.456,191.289 220.622 C 190.703 220.808,190.578 221.160,190.578 222.618 L 190.578 224.389 191.415 223.757 C 191.875 223.410,192.434 222.443,192.658 221.608 C 192.908 220.673,193.270 220.089,193.599 220.089 C 193.893 220.089,194.133 219.879,194.133 219.624 C 194.133 218.645,195.048 217.859,195.880 218.123 C 196.578 218.345,196.673 218.594,196.607 220.034 C 196.498 222.391,196.547 222.578,197.270 222.578 C 198.162 222.578,198.122 218.668,197.219 217.670 C 196.279 216.631,196.456 216.533,199.289 216.533 C 202.405 216.533,202.454 216.621,200.373 218.459 C 199.067 219.613,198.829 220.013,198.986 220.794 C 199.125 221.489,198.909 222.053,198.165 222.937 C 197.258 224.015,197.156 224.399,197.156 226.735 C 197.156 228.990,197.072 229.333,196.522 229.333 C 196.174 229.333,195.795 229.578,195.680 229.877 C 195.543 230.235,195.228 230.344,194.758 230.195 C 194.328 230.058,193.923 230.160,193.739 230.451 C 193.316 231.119,193.344 232.889,193.778 232.889 C 193.973 232.889,194.133 233.736,194.133 234.772 L 194.133 236.654 192.538 237.312 C 191.533 237.727,190.696 238.389,190.275 239.102 C 189.688 240.096,189.445 240.221,188.274 240.129 C 187.541 240.071,186.458 240.273,185.868 240.579 C 184.694 241.185,184.194 240.868,184.183 239.509 C 184.180 239.141,183.828 238.273,183.400 237.581 C 182.807 236.621,182.584 235.596,182.465 233.272 C 182.379 231.595,182.153 230.123,181.964 230.002 C 181.653 229.803,180.699 226.871,179.909 223.690 C 179.745 223.030,179.449 222.329,179.250 222.130 C 179.007 221.887,179.056 221.605,179.401 221.260 C 179.681 220.979,179.911 220.106,179.911 219.320 C 179.911 217.927,181.075 216.332,181.776 216.765 C 182.423 217.165,182.015 218.984,181.135 219.626 C 180.339 220.206,180.271 220.409,180.593 221.255 C 180.981 222.276,181.950 222.530,182.679 221.801 C 182.910 221.570,183.211 221.493,183.348 221.630 C 183.485 221.767,183.408 222.068,183.176 222.299 C 182.660 222.815,182.600 228.484,183.108 228.798 C 183.302 228.918,183.731 228.447,184.063 227.752 C 184.531 226.769,184.876 226.489,185.617 226.489 L 186.569 226.489 186.747 222.175 C 186.948 217.278,186.627 215.822,185.344 215.822 C 184.596 215.822,184.533 215.667,184.533 213.829 C 184.533 212.157,184.624 211.870,185.096 212.051 C 185.405 212.170,185.845 212.272,186.074 212.278 M237.831 214.072 C 236.884 214.316,236.239 213.954,236.595 213.378 C 236.753 213.121,237.116 213.137,237.755 213.428 L 238.684 213.851 237.831 214.072 M76.718 216.085 C 77.004 217.407,77.285 219.449,77.344 220.622 C 77.403 221.796,77.375 222.408,77.282 221.983 C 77.189 221.557,76.747 220.970,76.300 220.677 C 75.319 220.034,74.609 214.164,75.449 213.645 C 76.069 213.261,76.136 213.389,76.718 216.085 M83.427 214.647 C 82.704 215.371,83.295 220.089,84.109 220.089 C 84.372 220.089,84.750 220.369,84.949 220.711 C 85.253 221.233,85.311 221.161,85.310 220.267 C 85.309 219.680,85.079 218.800,84.800 218.311 C 84.521 217.822,84.286 216.832,84.279 216.110 C 84.267 214.834,83.889 214.185,83.427 214.647 M87.655 217.211 C 87.537 217.584,87.475 218.424,87.517 219.078 C 87.560 219.732,87.417 220.596,87.199 220.997 C 86.981 221.402,86.894 222.394,87.005 223.220 C 87.127 224.133,87.063 224.711,86.839 224.711 C 86.638 224.711,86.363 226.031,86.226 227.644 C 86.090 229.258,85.770 231.009,85.515 231.536 C 85.066 232.465,85.086 232.497,86.170 232.602 C 87.643 232.746,87.896 234.622,86.760 236.969 C 86.198 238.130,86.035 239.048,86.115 240.595 L 86.222 242.667 88.800 242.667 C 90.829 242.667,91.389 242.553,91.433 242.133 C 91.546 241.050,91.338 239.787,90.831 238.482 C 90.053 236.475,90.157 233.780,91.060 232.558 C 91.725 231.659,91.755 231.446,91.327 230.665 C 88.396 225.325,88.533 225.800,88.533 220.988 C 88.533 216.882,88.206 215.475,87.655 217.211 M69.084 218.293 C 69.436 218.626,69.709 219.207,69.691 219.583 C 69.594 221.617,69.708 226.125,69.879 227.026 C 69.954 227.419,70.502 228.028,71.096 228.379 C 72.320 229.102,72.493 230.321,71.690 232.565 C 71.258 233.775,71.286 233.894,72.239 234.847 C 73.258 235.865,73.537 236.933,72.889 237.333 C 72.693 237.454,72.533 238.174,72.533 238.933 C 72.533 239.692,72.693 240.412,72.889 240.533 C 73.335 240.809,73.360 244.509,72.918 244.782 C 72.738 244.893,72.483 244.492,72.351 243.890 C 72.219 243.289,71.909 242.719,71.662 242.624 C 71.204 242.449,70.241 239.470,69.867 237.077 C 69.754 236.350,69.278 235.299,68.810 234.743 C 68.116 233.918,67.912 233.158,67.706 230.618 C 67.567 228.906,67.251 227.301,67.002 227.053 C 66.116 226.166,65.635 223.780,66.112 222.628 C 66.432 221.857,66.445 221.383,66.163 220.856 C 64.739 218.195,66.942 216.263,69.084 218.293 M166.835 218.153 C 165.745 218.917,165.820 220.021,166.993 220.467 C 168.302 220.965,168.956 219.827,168.318 218.162 C 168.048 217.460,167.826 217.459,166.835 218.153 M174.510 220.116 C 174.440 220.326,174.230 220.498,174.044 220.498 C 173.859 220.498,173.649 220.326,173.579 220.116 C 173.509 219.905,173.719 219.733,174.044 219.733 C 174.370 219.733,174.580 219.905,174.510 220.116 M247.699 220.796 C 247.516 221.709,247.631 221.933,248.516 222.391 C 249.264 222.778,249.752 223.483,250.302 224.973 C 250.718 226.100,251.267 227.183,251.522 227.379 C 252.298 227.977,252.585 229.333,251.935 229.333 C 251.629 229.333,251.378 229.173,251.378 228.978 C 251.378 228.782,251.190 228.622,250.961 228.622 C 250.320 228.622,249.244 227.515,249.244 226.855 C 249.244 226.529,248.678 225.995,247.978 225.661 C 246.866 225.131,246.725 224.918,246.822 223.918 C 246.914 222.973,246.766 222.697,245.956 222.303 C 244.752 221.718,244.712 221.239,245.832 220.813 C 246.302 220.634,246.791 220.318,246.920 220.111 C 247.412 219.314,247.908 219.750,247.699 220.796 M230.388 224.000 C 230.997 224.000,231.879 225.860,231.668 226.700 C 231.259 228.328,227.911 227.122,227.911 225.347 C 227.911 224.494,228.939 223.588,229.629 223.832 C 229.890 223.925,230.231 224.000,230.388 224.000 M18.279 226.186 C 18.031 226.586,16.000 226.578,16.000 226.177 C 16.000 225.402,17.579 224.741,18.033 225.325 C 18.271 225.632,18.382 226.019,18.279 226.186 M187.804 227.627 C 187.556 227.875,187.378 229.065,187.378 230.471 C 187.378 232.819,187.352 232.889,186.480 232.889 C 184.902 232.889,184.317 236.092,185.511 238.191 C 186.829 240.506,187.808 238.982,187.886 234.494 C 187.909 233.206,188.009 233.058,188.978 232.882 C 189.989 232.698,190.041 232.605,189.973 231.099 C 189.810 227.453,189.106 226.325,187.804 227.627 M153.029 231.674 C 153.334 232.468,153.310 232.533,152.711 232.533 C 152.415 232.533,152.178 232.217,152.178 231.822 C 152.178 230.974,152.724 230.879,153.029 231.674 M76.747 235.646 C 76.257 239.107,76.768 244.915,77.615 245.508 C 78.570 246.177,78.863 249.085,78.119 250.523 C 77.425 251.865,77.186 256.883,77.787 257.485 C 78.509 258.206,78.363 260.817,77.320 265.827 C 77.110 266.837,76.173 267.157,75.475 266.459 C 74.976 265.960,74.963 265.454,75.356 261.926 C 75.666 259.138,75.694 257.320,75.449 255.822 C 75.257 254.649,75.178 252.169,75.273 250.311 C 75.567 244.559,75.557 241.031,75.233 237.253 C 74.884 233.176,75.230 231.968,76.436 233.059 C 76.938 233.514,76.989 233.935,76.747 235.646 M147.489 233.870 C 147.568 234.688,147.452 235.022,147.088 235.022 C 146.304 235.022,145.784 234.186,146.016 233.298 C 146.333 232.087,147.355 232.484,147.489 233.870 M219.733 236.622 C 219.733 237.356,219.904 237.510,220.711 237.506 C 222.299 237.497,222.906 236.944,222.043 236.292 C 220.878 235.412,219.733 235.576,219.733 236.622 M17.939 238.249 C 17.827 238.431,18.128 238.728,18.608 238.911 C 19.088 239.094,19.538 239.392,19.607 239.574 C 19.783 240.035,24.624 242.119,24.991 241.892 C 25.156 241.791,25.065 241.443,24.788 241.120 C 24.512 240.797,24.187 240.253,24.065 239.911 C 23.926 239.519,23.476 239.289,22.846 239.289 C 22.297 239.289,21.494 239.042,21.063 238.739 C 20.126 238.084,18.225 237.785,17.939 238.249 M161.040 239.507 C 161.267 240.410,161.686 241.381,161.971 241.666 C 162.638 242.333,162.642 244.764,161.977 245.315 C 161.554 245.667,161.392 245.492,161.032 244.292 C 160.556 242.704,159.953 242.462,159.188 243.553 C 158.915 243.943,158.586 244.156,158.457 244.027 C 158.107 243.677,158.173 241.139,158.538 240.913 C 158.712 240.806,158.965 240.277,159.100 239.739 C 159.678 237.438,160.494 237.341,161.040 239.507 M209.422 238.578 C 209.422 238.773,209.262 238.933,209.067 238.933 C 208.871 238.933,208.711 239.156,208.711 239.429 C 208.711 240.061,207.747 240.436,206.853 240.152 C 206.184 239.940,206.188 239.904,206.965 239.078 C 207.761 238.230,209.422 237.893,209.422 238.578 M197.784 239.502 C 198.057 239.775,197.316 241.422,196.921 241.422 C 196.567 241.422,196.517 239.868,196.859 239.526 C 197.153 239.232,197.504 239.223,197.784 239.502 M216.889 239.644 C 216.889 239.840,217.129 240.000,217.422 240.000 C 217.716 240.000,217.956 239.840,217.956 239.644 C 217.956 239.449,217.716 239.289,217.422 239.289 C 217.129 239.289,216.889 239.449,216.889 239.644 M242.055 239.588 C 242.530 239.890,241.177 240.711,240.205 240.711 C 239.615 240.711,238.858 239.839,239.173 239.523 C 239.501 239.195,241.507 239.241,242.055 239.588 M223.738 240.618 C 222.601 242.022,222.717 242.489,224.201 242.489 C 225.646 242.489,226.847 241.957,226.839 241.321 C 226.819 239.723,224.828 239.272,223.738 240.618 M25.956 242.220 C 25.956 242.968,26.163 243.141,27.280 243.322 C 29.631 243.703,29.470 242.024,27.111 241.560 C 26.056 241.353,25.956 241.410,25.956 242.220 M219.395 242.635 C 219.093 243.198,218.492 243.575,217.646 243.732 C 216.936 243.864,216.113 244.189,215.816 244.455 C 215.400 244.828,214.920 244.859,213.732 244.592 C 212.115 244.229,211.559 244.436,210.558 245.778 C 210.302 246.120,209.814 246.400,209.473 246.400 C 208.616 246.400,208.000 247.098,208.000 248.071 C 208.000 249.549,209.320 249.213,216.000 246.038 C 216.782 245.667,218.398 245.258,219.590 245.130 C 222.461 244.823,223.251 243.466,221.175 242.408 C 220.495 242.061,219.919 241.778,219.896 241.778 C 219.873 241.778,219.647 242.164,219.395 242.635 M176.103 248.500 C 175.616 249.280,176.210 251.015,176.965 251.019 C 177.734 251.024,178.251 249.607,177.822 248.666 C 177.358 247.647,176.677 247.582,176.103 248.500 M243.243 248.847 C 242.501 249.329,243.107 249.956,244.314 249.956 C 245.143 249.956,245.359 249.815,245.267 249.333 C 245.134 248.636,243.992 248.362,243.243 248.847 M214.844 250.049 C 213.090 250.471,212.866 251.219,214.392 251.554 C 216.145 251.939,217.702 250.983,217.047 249.923 C 216.822 249.559,216.897 249.555,214.844 250.049 M101.517 250.400 C 100.854 252.369,101.895 253.190,102.972 251.547 C 103.496 250.747,103.512 250.558,103.083 250.286 C 102.366 249.832,101.692 249.881,101.517 250.400 M156.299 251.101 C 155.792 251.875,155.735 256.867,156.162 263.111 C 156.182 263.404,156.081 264.220,155.937 264.923 C 155.620 266.468,156.329 267.378,157.851 267.378 C 158.402 267.378,159.310 267.617,159.870 267.909 C 161.980 269.009,162.853 268.193,162.842 265.129 C 162.839 264.312,162.921 261.201,163.024 258.215 C 163.262 251.292,163.034 250.669,160.258 250.662 C 159.236 250.659,158.054 250.564,157.630 250.450 C 157.070 250.300,156.707 250.477,156.299 251.101 M237.196 251.124 C 235.809 251.655,235.086 252.186,234.577 253.051 C 234.060 253.927,233.699 254.189,233.218 254.036 C 231.612 253.526,227.535 253.775,226.815 254.426 C 226.190 254.992,225.910 255.021,224.559 254.660 C 222.647 254.148,221.655 254.322,220.857 255.307 C 220.015 256.347,216.809 256.374,215.689 255.350 C 214.556 254.314,213.481 254.116,211.535 254.583 C 209.013 255.188,209.070 256.174,211.644 256.479 C 214.331 256.797,217.662 257.723,218.346 258.342 C 218.669 258.635,219.554 258.971,220.311 259.088 C 222.049 259.357,224.239 260.584,227.238 262.969 C 230.371 265.460,231.813 266.308,232.923 266.310 C 233.910 266.311,235.022 267.277,235.022 268.134 C 235.022 268.813,237.625 271.520,238.564 271.818 C 239.071 271.979,239.289 272.354,239.289 273.065 C 239.289 274.121,240.814 275.707,241.571 275.438 C 242.263 275.193,241.892 272.933,241.070 272.388 C 240.166 271.787,238.166 268.975,238.445 268.696 C 240.067 267.074,239.053 264.645,235.596 261.867 C 232.038 259.008,231.820 258.494,233.660 257.289 C 235.651 255.986,238.305 255.964,239.144 257.244 C 239.503 257.792,240.060 258.133,240.598 258.133 C 241.616 258.133,242.709 258.649,243.803 259.644 C 244.524 260.300,244.629 260.311,245.162 259.778 C 245.899 259.041,246.540 259.045,247.156 259.788 C 247.777 260.536,249.668 261.333,250.822 261.333 C 252.403 261.333,251.440 259.878,249.481 259.307 C 248.569 259.041,247.822 258.680,247.822 258.506 C 247.822 258.331,247.275 258.008,246.606 257.787 C 245.937 257.566,245.206 257.164,244.982 256.894 C 244.757 256.623,244.098 256.297,243.517 256.169 C 240.800 255.573,237.779 253.613,238.643 253.008 C 239.085 252.698,239.787 252.444,240.202 252.444 C 241.037 252.444,242.489 251.346,242.489 250.714 C 242.489 250.066,239.317 250.312,237.196 251.124 M34.041 251.719 C 32.413 252.035,31.905 252.444,33.141 252.444 C 33.638 252.444,34.544 252.544,35.156 252.667 C 36.121 252.860,36.267 252.790,36.267 252.133 C 36.267 251.333,36.146 251.311,34.041 251.719 M58.133 252.096 C 57.619 252.312,57.937 252.401,59.284 252.419 C 61.067 252.443,61.168 252.497,61.666 253.689 C 62.256 255.102,62.523 255.166,64.387 254.343 C 65.541 253.834,66.418 252.610,65.957 252.150 C 65.661 251.854,58.824 251.807,58.133 252.096 M272.397 254.133 C 271.938 254.952,271.428 253.875,271.808 252.889 C 272.036 252.296,272.064 252.296,272.397 252.889 C 272.626 253.296,272.626 253.726,272.397 254.133 M217.264 253.310 C 216.914 253.731,217.076 253.885,218.198 254.197 C 220.752 254.906,221.450 254.693,220.940 253.362 C 220.658 252.628,217.863 252.588,217.264 253.310 M152.955 254.612 C 151.964 254.992,152.238 255.660,153.300 255.456 C 154.268 255.270,154.525 255.000,154.110 254.609 C 153.919 254.429,153.428 254.431,152.955 254.612 M194.311 256.711 C 194.180 256.923,194.611 257.067,195.378 257.067 C 196.145 257.067,196.575 256.923,196.444 256.711 C 196.324 256.516,195.844 256.356,195.378 256.356 C 194.912 256.356,194.432 256.516,194.311 256.711 M62.276 258.311 C 62.276 258.497,62.104 258.706,61.893 258.776 C 61.683 258.846,61.511 258.637,61.511 258.311 C 61.511 257.985,61.683 257.776,61.893 257.846 C 62.104 257.916,62.276 258.125,62.276 258.311 M276.776 261.367 C 277.301 261.857,276.792 262.101,275.775 261.845 C 275.263 261.717,274.844 261.378,274.844 261.093 C 274.844 260.552,276.092 260.729,276.776 261.367 M245.876 262.030 C 245.729 262.267,245.784 262.637,245.998 262.852 C 246.545 263.398,246.891 262.934,246.482 262.203 C 246.233 261.759,246.072 261.713,245.876 262.030 M253.156 262.763 C 253.156 262.963,253.556 263.309,254.044 263.531 C 254.533 263.754,254.933 264.071,254.933 264.235 C 254.933 264.399,255.177 264.533,255.475 264.533 C 255.774 264.533,256.170 264.933,256.356 265.422 C 256.541 265.911,256.920 266.311,257.198 266.311 C 257.475 266.311,257.794 266.551,257.906 266.844 C 258.027 267.160,258.562 267.378,259.214 267.378 C 260.869 267.378,260.585 265.905,258.862 265.555 C 258.187 265.417,257.466 265.075,257.260 264.793 C 257.055 264.512,256.544 264.173,256.126 264.040 C 255.708 263.907,255.283 263.484,255.183 263.099 C 254.991 262.365,253.156 262.061,253.156 262.763 M247.467 263.981 C 247.467 264.319,250.928 267.658,251.716 268.080 C 252.306 268.395,252.444 268.364,252.444 267.912 C 252.444 267.606,252.220 267.269,251.946 267.164 C 251.672 267.059,251.368 266.666,251.269 266.291 C 251.171 265.916,250.692 265.457,250.205 265.272 C 249.718 265.086,249.262 264.786,249.193 264.603 C 249.051 264.231,247.467 263.659,247.467 263.981 M54.673 265.273 C 53.944 265.445,52.562 265.997,51.602 266.499 C 50.523 267.063,49.536 267.339,49.017 267.222 C 48.421 267.087,47.828 267.334,46.967 268.077 L 45.757 269.121 46.718 269.559 C 47.466 269.899,47.938 269.903,48.843 269.576 C 49.483 269.345,50.535 269.156,51.182 269.156 C 51.828 269.156,53.350 268.667,54.564 268.069 C 55.844 267.439,57.621 266.895,58.798 266.774 C 61.222 266.524,61.233 266.018,58.826 265.384 C 56.812 264.853,56.491 264.845,54.673 265.273 M67.732 265.603 C 67.467 266.032,68.337 266.418,69.194 266.252 C 69.532 266.187,69.874 265.933,69.956 265.689 C 70.136 265.147,68.063 265.066,67.732 265.603 M24.356 268.800 C 24.235 268.996,24.465 269.156,24.868 269.156 C 25.271 269.156,25.600 268.996,25.600 268.800 C 25.600 268.604,25.369 268.444,25.088 268.444 C 24.806 268.444,24.476 268.604,24.356 268.800 M252.800 269.645 C 252.800 270.673,253.568 271.381,254.355 271.079 C 255.027 270.821,255.077 270.443,254.565 269.488 C 254.024 268.477,252.800 268.587,252.800 269.645 M40.951 271.045 C 39.939 272.122,39.975 272.356,41.157 272.356 C 41.784 272.356,42.498 271.972,43.142 271.289 L 44.149 270.222 42.937 270.222 C 42.129 270.222,41.466 270.497,40.951 271.045 M245.333 270.578 C 245.333 270.773,245.663 270.933,246.065 270.933 C 246.468 270.933,246.699 270.773,246.578 270.578 C 246.457 270.382,246.127 270.222,245.846 270.222 C 245.564 270.222,245.333 270.382,245.333 270.578 M74.780 272.647 C 75.135 274.454,74.024 274.347,73.466 272.520 C 73.300 271.976,73.413 271.783,73.919 271.745 C 74.386 271.710,74.651 271.987,74.780 272.647 M247.532 272.978 C 247.652 274.018,248.915 274.470,249.903 273.826 C 250.747 273.277,249.764 272.000,248.497 272.000 C 247.531 272.000,247.431 272.101,247.532 272.978 M78.222 275.046 C 78.222 276.458,75.975 277.228,75.636 275.932 C 75.536 275.552,75.544 275.152,75.653 275.043 C 75.914 274.782,78.222 274.785,78.222 275.046 M277.559 275.752 C 278.660 276.940,278.622 277.406,277.435 277.268 C 276.666 277.178,276.422 276.920,276.235 276.000 C 275.950 274.594,276.407 274.509,277.559 275.752 M245.600 275.954 C 244.849 276.374,244.786 277.184,245.485 277.452 C 246.173 277.716,246.890 276.799,246.517 276.133 C 246.302 275.748,246.054 275.700,245.600 275.954 M107.025 279.286 C 106.038 280.475,106.888 282.862,108.528 283.506 L 110.004 284.086 109.196 284.839 C 108.584 285.409,108.444 285.820,108.619 286.529 C 109.004 288.089,109.457 288.258,110.327 287.166 L 111.123 286.168 112.499 287.262 C 114.061 288.503,114.241 288.549,114.815 287.857 C 115.446 287.097,113.826 284.450,112.132 283.473 C 111.375 283.036,110.917 282.676,111.114 282.673 C 111.942 282.659,112.406 281.231,111.992 279.974 C 111.526 278.564,111.048 278.419,110.609 279.556 C 109.518 282.381,109.665 282.306,108.852 280.444 C 108.068 278.650,107.730 278.436,107.025 279.286 M38.044 283.334 C 38.044 283.897,37.824 284.541,37.554 284.764 C 36.658 285.508,36.529 287.334,37.331 287.896 C 38.040 288.393,38.272 289.837,37.829 290.993 C 37.528 291.778,36.283 291.695,35.361 290.829 C 34.936 290.429,33.805 289.797,32.849 289.423 C 31.672 288.963,31.375 288.739,31.929 288.728 C 33.882 288.688,35.306 287.403,34.311 286.578 C 34.018 286.334,33.778 285.835,33.778 285.468 C 33.778 285.100,33.618 284.800,33.422 284.800 C 32.290 284.800,33.365 284.073,35.058 283.694 C 36.154 283.449,37.131 283.038,37.230 282.780 C 37.550 281.946,38.044 282.283,38.044 283.334 M89.109 289.609 C 88.423 290.295,88.429 290.226,88.946 291.361 C 89.551 292.688,91.022 292.311,91.022 290.828 C 91.022 289.726,89.782 288.935,89.109 289.609 M77.156 291.733 C 77.156 292.737,77.294 293.290,77.511 293.156 C 77.707 293.035,77.867 292.395,77.867 291.733 C 77.867 291.072,77.707 290.432,77.511 290.311 C 77.294 290.177,77.156 290.729,77.156 291.733 M81.739 290.844 C 81.712 291.333,81.700 292.813,81.712 294.133 C 81.731 296.278,81.660 296.533,81.045 296.533 C 80.420 296.533,80.358 296.790,80.385 299.289 C 80.412 301.877,80.442 301.980,80.879 300.978 C 81.406 299.770,82.492 293.772,82.483 292.115 C 82.476 290.684,81.811 289.548,81.739 290.844 M30.738 292.958 C 31.343 293.627,31.325 293.659,30.171 293.957 C 28.611 294.358,28.125 296.100,27.840 302.311 C 27.685 305.670,27.512 306.844,27.172 306.844 C 26.183 306.844,24.939 306.139,24.721 305.455 C 24.573 304.988,24.058 304.654,23.251 304.503 C 22.249 304.315,21.970 304.074,21.806 303.254 C 21.514 301.792,20.942 301.444,20.002 302.158 C 19.024 302.901,19.251 304.103,20.475 304.660 C 21.573 305.161,21.557 305.414,20.247 308.187 L 19.160 310.486 18.351 309.726 L 17.542 308.966 16.862 310.366 C 15.600 312.960,14.236 312.131,14.228 308.766 C 14.224 307.113,14.053 306.403,13.511 305.778 C 12.592 304.718,12.586 304.754,14.045 302.525 C 15.832 299.793,15.901 299.733,17.276 299.733 C 18.786 299.733,20.223 299.023,21.081 297.853 C 21.431 297.375,22.391 296.686,23.214 296.322 C 24.037 295.958,24.907 295.395,25.147 295.071 C 25.387 294.747,26.015 294.373,26.542 294.241 C 27.069 294.108,27.993 293.612,28.595 293.137 C 29.919 292.093,29.953 292.091,30.738 292.958 M133.867 294.756 C 133.484 295.375,134.051 295.904,134.606 295.444 C 134.879 295.216,135.016 294.889,134.908 294.715 C 134.649 294.296,134.139 294.315,133.867 294.756 M75.383 297.333 C 75.385 298.751,75.492 300.303,75.620 300.781 C 76.175 302.855,76.724 298.374,76.222 295.867 C 75.828 293.896,75.378 294.683,75.383 297.333 M272.626 300.312 C 272.228 301.184,271.322 301.072,271.233 300.140 C 271.033 298.067,271.929 297.023,272.581 298.569 C 272.860 299.230,272.874 299.767,272.626 300.312 M230.920 301.654 C 229.991 302.334,230.548 303.909,232.000 304.708 C 232.587 305.031,233.440 305.966,233.897 306.787 C 234.354 307.608,235.188 308.518,235.750 308.809 C 236.465 309.178,236.890 309.768,237.156 310.759 C 237.556 312.243,238.420 313.026,240.117 313.444 C 240.671 313.580,241.260 314.031,241.428 314.446 C 241.712 315.149,241.734 315.137,241.755 314.260 C 241.768 313.743,241.576 313.243,241.330 313.149 C 241.084 313.054,240.693 312.271,240.463 311.409 C 240.125 310.146,239.797 309.724,238.777 309.238 C 237.870 308.805,237.511 308.403,237.511 307.818 C 237.511 306.733,236.638 305.541,235.361 304.880 C 234.762 304.571,234.219 303.935,234.080 303.381 C 233.632 301.597,232.125 300.773,230.920 301.654 M271.385 303.198 C 271.763 303.540,272.734 304.064,273.544 304.363 C 275.078 304.930,275.424 305.549,275.047 307.050 C 274.724 308.336,273.598 308.125,272.041 306.489 C 271.297 305.707,270.440 305.067,270.138 305.067 C 269.417 305.067,269.176 304.375,269.546 303.378 C 269.903 302.417,270.462 302.363,271.385 303.198 M78.815 304.593 C 78.443 304.965,78.538 306.489,78.933 306.489 C 79.129 306.489,79.289 306.009,79.289 305.422 C 79.289 304.318,79.217 304.191,78.815 304.593 M158.438 305.716 C 158.338 305.878,158.356 306.389,158.477 306.853 C 158.683 307.639,158.715 307.649,158.968 307.003 C 159.470 305.721,159.056 304.716,158.438 305.716 M271.183 308.127 C 271.661 309.156,270.941 311.607,270.061 311.944 C 269.808 312.042,269.485 312.894,269.343 313.838 L 269.086 315.554 268.650 314.488 C 268.311 313.660,268.307 312.978,268.630 311.427 C 268.859 310.330,268.973 308.930,268.883 308.316 C 268.660 306.793,270.494 306.642,271.183 308.127 M159.853 308.802 C 159.670 309.535,159.416 309.689,158.393 309.689 C 157.310 309.689,157.156 309.800,157.156 310.578 C 157.156 311.266,157.339 311.467,157.965 311.467 C 158.815 311.467,160.711 309.615,160.711 308.784 C 160.711 307.897,160.077 307.911,159.853 308.802 M165.812 308.815 C 165.696 309.117,164.941 309.698,164.134 310.107 C 161.774 311.304,161.613 312.178,163.754 312.178 C 164.427 312.178,164.978 312.016,164.978 311.818 C 164.978 311.620,165.878 310.882,166.979 310.178 C 168.467 309.226,168.854 308.819,168.490 308.588 C 167.687 308.079,166.040 308.219,165.812 308.815 M24.739 310.583 C 25.256 311.543,25.322 311.976,25.023 312.450 C 24.253 313.669,23.650 313.162,23.537 311.200 C 23.412 309.026,23.795 308.830,24.739 310.583 M20.034 312.800 C 20.591 314.793,20.521 316.166,19.816 317.067 C 18.575 318.653,17.369 314.636,18.350 312.185 C 19.109 310.286,19.356 310.376,20.034 312.800 M273.778 312.910 C 273.778 313.508,273.639 313.912,273.470 313.807 C 273.183 313.630,273.340 311.822,273.641 311.822 C 273.716 311.822,273.778 312.312,273.778 312.910 M25.113 317.195 C 25.557 319.930,22.879 322.547,21.438 320.787 C 20.389 319.506,20.424 319.004,21.573 318.868 C 22.276 318.785,22.605 318.479,22.840 317.689 C 23.763 314.582,24.658 314.388,25.113 317.195 M251.815 317.512 C 251.192 318.510,251.265 319.363,251.962 319.226 C 252.941 319.033,253.409 317.967,252.787 317.346 C 252.312 316.870,252.204 316.889,251.815 317.512 M189.058 319.150 C 188.927 319.281,188.904 319.526,189.008 319.694 C 189.272 320.121,190.933 320.078,190.933 319.644 C 190.933 319.449,190.786 319.289,190.607 319.289 C 190.427 319.289,190.059 319.204,189.788 319.100 C 189.518 318.996,189.189 319.019,189.058 319.150 M180.435 323.289 C 181.329 324.558,179.261 324.650,178.008 323.398 L 177.099 322.489 178.485 322.489 C 179.518 322.489,180.014 322.693,180.435 323.289 M27.620 327.895 C 27.841 332.827,26.750 333.173,25.989 328.412 C 25.577 325.839,25.593 325.576,26.194 324.986 C 27.172 324.026,27.475 324.643,27.620 327.895 M195.618 328.969 C 195.422 329.165,195.071 329.207,194.837 329.062 C 194.515 328.863,194.525 328.731,194.878 328.512 C 195.485 328.137,196.081 328.506,195.618 328.969 M224.485 334.811 C 225.034 334.974,224.913 335.147,223.774 335.825 C 222.355 336.670,218.713 337.525,217.776 337.233 C 216.045 336.692,216.081 336.723,216.537 336.174 C 216.815 335.838,217.607 335.644,218.698 335.644 C 220.082 335.644,220.498 335.498,220.818 334.900 C 221.217 334.155,222.182 334.131,224.485 334.811 M228.171 338.554 C 229.201 338.981,230.044 339.441,230.044 339.576 C 230.044 339.941,227.516 340.275,226.304 340.070 C 224.361 339.741,224.275 339.654,224.917 338.673 C 225.632 337.583,225.811 337.576,228.171 338.554 M216.000 339.378 C 216.000 339.791,214.230 340.058,213.459 339.762 C 213.169 339.651,213.038 339.391,213.166 339.183 C 213.456 338.714,216.000 338.889,216.000 339.378 ");
				attr(path1, "stroke", "none");
				attr(path1, "fill", "#b36a2f");
				attr(path1, "fill-rule", "evenodd");
				add_location(path1, file$7, 9, 23641, 23816);
				attr(path2, "id", "path2");
				attr(path2, "d", "M52.978 125.333 C 52.114 126.213,51.487 126.933,51.585 126.933 C 51.683 126.933,52.470 126.213,53.333 125.333 C 54.197 124.453,54.824 123.733,54.726 123.733 C 54.628 123.733,53.841 124.453,52.978 125.333 M44.918 131.773 C 44.274 132.285,43.261 132.697,42.554 132.734 C 41.139 132.809,41.159 133.333,42.577 133.333 C 43.561 133.333,45.735 132.045,46.028 131.289 C 46.250 130.716,46.246 130.718,44.918 131.773 M164.622 130.999 C 164.622 131.962,165.439 132.978,166.213 132.978 C 166.707 132.978,167.106 132.858,167.100 132.711 C 167.083 132.318,166.044 131.009,166.044 131.381 C 166.044 131.555,165.852 131.506,165.618 131.271 C 165.199 130.852,164.622 130.695,164.622 130.999 M69.178 133.044 C 68.552 134.534,69.026 135.632,70.164 135.327 C 70.587 135.214,71.133 135.119,71.378 135.116 C 72.465 135.104,71.791 132.993,70.479 132.302 C 69.739 131.912,69.627 131.976,69.178 133.044 M169.600 133.635 C 169.600 133.815,169.880 134.054,170.222 134.168 C 170.564 134.281,171.244 134.639,171.733 134.964 L 172.622 135.554 171.733 134.789 C 170.504 133.731,169.600 133.242,169.600 133.635 M44.978 135.467 C 44.836 135.696,44.880 136.044,45.075 136.240 C 45.312 136.477,45.517 136.456,45.689 136.178 C 45.831 135.948,45.787 135.600,45.591 135.405 C 45.354 135.168,45.150 135.188,44.978 135.467 M60.103 135.432 C 59.658 135.730,59.678 135.883,60.249 136.514 C 61.036 137.384,61.053 137.364,59.055 137.994 C 56.296 138.865,56.154 140.639,58.790 141.307 C 60.250 141.677,60.552 142.824,59.563 144.237 C 59.075 144.934,59.106 145.016,60.008 145.404 C 61.159 145.899,62.578 147.972,62.578 149.159 C 62.578 149.623,62.738 150.101,62.933 150.222 C 63.129 150.343,63.289 150.775,63.289 151.182 C 63.289 151.840,64.786 153.635,65.636 153.997 C 66.178 154.228,67.200 156.766,67.200 157.879 C 67.200 158.887,67.132 158.933,65.641 158.933 C 64.456 158.933,64.044 159.082,63.922 159.556 C 63.622 160.712,64.020 161.067,65.619 161.067 C 66.955 161.067,67.295 161.226,67.989 162.175 C 68.435 162.784,69.334 163.649,69.987 164.095 L 71.173 164.908 70.100 165.143 C 68.754 165.439,68.009 166.225,68.791 166.525 C 69.089 166.640,69.333 166.995,69.333 167.315 C 69.333 167.635,69.733 168.373,70.222 168.954 C 70.937 169.803,71.113 170.405,71.123 172.027 L 71.135 174.044 71.806 173.240 C 72.175 172.797,72.538 172.254,72.611 172.033 C 72.709 171.741,72.971 171.752,73.572 172.074 C 74.589 172.618,74.413 175.444,73.304 176.365 C 72.510 177.024,72.096 178.492,72.512 179.166 C 72.745 179.542,72.954 179.393,73.395 178.541 C 73.714 177.926,74.130 177.422,74.320 177.422 C 74.511 177.422,74.667 176.631,74.667 175.664 C 74.667 174.097,74.773 173.854,75.644 173.433 C 76.650 172.947,76.698 172.692,76.422 169.315 C 76.386 168.864,76.729 168.099,77.185 167.613 C 78.001 166.745,78.004 166.710,77.386 165.562 C 76.745 164.373,77.041 162.755,78.027 162.064 C 78.588 161.670,77.930 161.270,76.699 161.257 C 75.852 161.248,75.532 161.065,75.434 160.533 C 75.136 158.934,73.493 158.302,73.073 159.625 C 72.814 160.441,70.127 160.991,69.130 160.433 C 68.414 160.033,68.693 159.904,71.190 159.483 C 71.918 159.361,72.656 159.006,72.830 158.695 C 73.082 158.245,73.590 158.162,75.329 158.288 C 77.761 158.463,78.429 157.385,76.800 155.911 C 76.041 155.224,75.860 154.139,76.444 153.778 C 77.064 153.395,76.830 152.139,75.944 151.086 C 74.890 149.833,74.365 147.254,75.072 146.806 C 75.924 146.266,76.290 146.462,76.638 147.644 C 77.019 148.939,77.987 149.202,78.151 148.056 C 78.348 146.674,75.328 144.829,74.857 146.044 C 74.637 146.613,74.580 146.617,74.192 146.091 C 73.958 145.775,73.290 145.411,72.706 145.282 C 71.514 145.020,70.913 141.511,72.060 141.511 C 72.333 141.511,72.648 141.271,72.760 140.978 C 72.873 140.684,73.228 140.432,73.549 140.416 C 73.886 140.400,73.953 140.315,73.709 140.216 C 73.475 140.121,73.350 139.853,73.430 139.621 C 74.112 137.649,71.733 135.635,70.211 136.898 C 69.899 137.157,69.711 137.104,69.560 136.711 C 69.414 136.330,69.084 136.227,68.487 136.377 C 67.867 136.532,67.522 136.410,67.260 135.941 C 66.843 135.195,61.071 134.785,60.103 135.432 M82.297 140.669 C 82.173 141.230,81.845 142.514,81.569 143.521 C 81.293 144.529,81.067 145.712,81.067 146.149 C 81.067 146.586,80.787 147.151,80.444 147.404 C 79.979 147.747,79.924 147.967,80.226 148.273 C 80.529 148.581,80.774 148.476,81.213 147.852 C 81.608 147.292,81.881 147.156,82.054 147.434 C 82.196 147.660,82.288 146.860,82.259 145.656 C 82.231 144.452,82.333 142.667,82.487 141.689 C 82.793 139.747,82.660 139.033,82.297 140.669 M171.821 143.010 C 170.897 144.137,171.257 145.778,172.427 145.778 C 173.254 145.778,173.539 145.046,173.202 143.787 C 172.900 142.655,172.361 142.352,171.821 143.010 M47.891 143.161 C 47.607 143.445,47.928 144.000,48.377 144.000 C 48.561 144.000,48.711 143.760,48.711 143.467 C 48.711 142.917,48.292 142.760,47.891 143.161 M153.793 144.687 C 153.680 144.869,153.744 145.113,153.933 145.231 C 154.428 145.536,156.122 145.053,155.888 144.673 C 155.629 144.254,154.054 144.264,153.793 144.687 M179.289 147.473 C 178.340 147.630,178.315 147.809,179.043 149.268 C 180.103 151.394,180.102 152.750,179.037 154.146 C 177.151 156.618,179.388 157.219,181.511 154.810 C 182.525 153.660,183.467 153.230,183.467 153.918 C 183.467 154.324,184.502 154.728,184.905 154.479 C 185.338 154.211,184.908 153.244,184.356 153.244 C 183.846 153.244,183.467 152.473,183.467 151.438 C 183.467 151.062,183.267 150.750,183.022 150.744 C 182.268 150.724,181.027 149.476,180.779 148.488 C 180.504 147.393,180.362 147.296,179.289 147.473 M211.556 149.689 C 211.849 149.878,212.329 150.034,212.622 150.034 C 213.096 150.034,213.096 149.995,212.622 149.689 C 212.329 149.499,211.849 149.344,211.556 149.344 C 211.081 149.344,211.081 149.383,211.556 149.689 M57.087 150.367 C 56.574 151.197,57.328 152.433,58.723 153.049 C 60.198 153.699,60.459 155.311,59.315 156.696 C 58.629 157.526,60.716 158.933,62.632 158.933 C 63.914 158.933,64.209 156.316,62.972 155.923 C 62.156 155.664,61.808 154.755,61.538 152.178 L 61.333 150.222 59.320 150.117 C 58.213 150.058,57.208 150.171,57.087 150.367 M173.857 151.314 C 173.228 152.969,173.756 153.956,175.270 153.956 C 176.688 153.956,176.902 153.330,176.211 151.200 C 175.835 150.039,174.314 150.112,173.857 151.314 M188.637 150.731 C 188.328 151.231,189.065 151.543,189.917 151.273 C 190.510 151.085,190.567 150.967,190.180 150.722 C 189.537 150.315,188.893 150.318,188.637 150.731 M207.110 150.758 C 206.840 151.195,207.818 151.621,208.344 151.296 C 208.552 151.167,208.631 150.913,208.518 150.731 C 208.247 150.292,207.387 150.308,207.110 150.758 M78.218 151.294 C 77.421 152.254,78.351 156.434,79.178 155.607 C 79.319 155.466,79.501 154.317,79.581 153.053 C 79.734 150.645,79.262 150.036,78.218 151.294 M215.275 152.054 C 214.124 152.895,216.625 153.876,219.025 153.524 C 220.386 153.324,220.513 154.359,219.200 154.958 C 218.123 155.448,218.035 156.089,219.046 156.089 C 219.654 156.089,220.963 155.594,221.454 155.180 C 221.910 154.794,219.785 152.866,218.692 152.675 C 217.994 152.553,217.095 152.249,216.696 152.000 C 216.099 151.627,215.846 151.637,215.275 152.054 M75.171 153.816 C 75.939 154.110,75.894 155.609,75.111 155.812 C 74.127 156.067,73.600 155.740,73.600 154.874 C 73.600 153.668,74.031 153.378,75.171 153.816 M158.578 155.731 C 158.578 155.925,158.082 156.525,157.477 157.064 C 155.492 158.831,155.429 159.362,157.216 159.255 C 158.063 159.205,158.956 159.012,159.200 158.827 C 159.862 158.326,159.786 155.378,159.111 155.378 C 158.818 155.378,158.578 155.537,158.578 155.731 M186.133 155.733 C 186.254 155.929,186.744 156.089,187.221 156.089 C 187.698 156.089,188.089 155.929,188.089 155.733 C 188.089 155.538,187.599 155.378,187.001 155.378 C 186.367 155.378,186.005 155.526,186.133 155.733 M224.155 156.836 C 223.913 157.228,224.811 157.618,225.575 157.452 C 225.967 157.367,225.871 157.216,225.240 156.922 C 224.726 156.683,224.272 156.647,224.155 156.836 M171.733 157.867 C 171.207 158.850,171.819 159.642,173.110 159.650 C 174.515 159.658,174.922 160.080,174.870 161.471 C 174.844 162.165,174.937 162.918,175.077 163.144 C 175.222 163.379,175.122 163.556,174.843 163.556 C 173.500 163.556,171.378 165.006,171.378 165.925 C 171.378 166.436,171.098 167.067,170.756 167.327 C 170.413 167.587,170.321 167.805,170.550 167.811 C 171.321 167.832,171.935 172.389,171.285 173.277 C 170.716 174.055,169.600 173.715,169.600 172.762 C 169.600 172.392,169.453 172.089,169.274 172.089 C 169.094 172.089,168.694 171.992,168.385 171.873 C 167.540 171.549,167.668 172.888,168.533 173.429 C 169.065 173.761,169.244 174.258,169.244 175.399 C 169.244 177.430,168.900 177.698,166.660 177.406 C 164.805 177.164,164.285 177.382,164.272 178.405 C 164.264 179.043,166.433 181.237,167.320 181.489 C 168.160 181.728,170.278 180.090,169.501 179.803 C 169.262 179.715,169.782 179.673,170.655 179.710 C 172.193 179.775,172.253 179.821,172.526 181.136 C 172.850 182.692,172.376 183.551,171.282 183.391 C 168.620 183.002,171.055 187.647,173.804 188.203 C 174.608 188.365,179.088 191.838,181.134 193.883 C 183.428 196.177,186.834 192.395,185.136 189.438 C 184.805 188.860,184.533 187.781,184.533 187.040 C 184.533 185.700,184.524 185.691,182.880 185.506 C 181.885 185.394,181.099 185.092,180.906 184.749 C 180.731 184.434,180.135 184.178,179.581 184.178 C 177.553 184.178,177.493 181.361,179.434 177.264 C 179.892 176.296,180.269 174.936,180.272 174.241 C 180.286 170.811,181.583 167.633,183.225 167.006 C 183.703 166.823,183.807 166.551,183.625 165.957 C 183.295 164.884,183.270 164.868,182.519 165.265 C 182.160 165.454,180.948 165.798,179.825 166.029 C 178.556 166.290,177.600 166.712,177.297 167.144 C 176.527 168.243,175.644 167.647,175.644 166.027 C 175.644 165.278,175.807 164.564,176.006 164.441 C 176.205 164.318,176.275 164.069,176.163 163.887 C 176.050 163.704,176.207 163.556,176.512 163.556 C 177.119 163.556,177.284 162.621,176.710 162.429 C 176.473 162.350,176.473 161.898,176.710 161.069 C 177.362 158.796,177.204 158.285,175.733 157.910 C 172.447 157.072,172.161 157.068,171.733 157.867 M160.653 159.884 C 160.249 159.991,159.985 160.596,159.820 161.791 C 159.513 164.028,159.889 166.420,160.511 166.182 C 160.762 166.085,161.466 166.427,162.076 166.940 C 162.686 167.453,163.349 167.772,163.548 167.649 C 163.748 167.526,163.911 167.611,163.911 167.839 C 163.911 168.067,164.131 168.169,164.400 168.066 C 164.688 167.956,165.051 168.233,165.281 168.739 C 165.722 169.706,166.400 169.892,166.400 169.046 C 166.400 168.741,166.548 168.583,166.730 168.695 C 166.911 168.807,167.157 168.593,167.276 168.219 C 167.415 167.779,167.718 167.599,168.136 167.708 C 169.753 168.131,169.868 163.986,168.292 162.104 C 168.033 161.795,167.928 161.435,168.058 161.304 C 168.189 161.174,168.115 161.067,167.893 161.067 C 167.671 161.067,167.573 160.848,167.676 160.580 C 167.984 159.776,162.944 159.277,160.653 159.884 M60.996 162.366 C 60.590 163.982,62.351 164.554,62.942 162.999 C 63.466 161.622,63.380 161.422,62.261 161.422 C 61.445 161.422,61.184 161.617,60.996 162.366 M54.044 163.881 C 54.044 164.640,54.216 164.978,54.601 164.978 C 54.996 164.978,55.126 164.701,55.046 164.027 C 54.882 162.643,54.044 162.521,54.044 163.881 M63.706 165.445 C 62.918 166.284,62.678 167.622,63.252 167.977 C 63.427 168.085,63.656 167.949,63.762 167.674 C 63.867 167.399,64.524 166.968,65.221 166.716 C 65.918 166.463,66.489 166.129,66.489 165.973 C 66.489 165.817,66.729 165.689,67.022 165.689 C 67.316 165.689,67.556 165.449,67.556 165.156 C 67.556 164.231,64.641 164.450,63.706 165.445 M74.864 166.075 C 75.230 166.668,74.406 167.348,73.915 166.858 C 73.505 166.447,73.762 165.689,74.311 165.689 C 74.484 165.689,74.732 165.863,74.864 166.075 M224.356 167.427 C 224.356 168.365,224.507 168.530,225.553 168.726 C 226.733 168.947,226.748 168.973,226.573 170.520 C 226.412 171.953,226.464 172.089,227.178 172.089 C 227.800 172.089,227.913 171.943,227.730 171.369 C 227.605 170.973,227.634 170.672,227.795 170.700 C 228.763 170.868,229.333 170.592,229.333 169.956 C 229.333 169.564,229.499 169.244,229.701 169.244 C 229.949 169.244,229.955 169.030,229.718 168.588 C 229.476 168.136,229.495 167.803,229.777 167.521 C 230.086 167.211,230.078 167.111,229.743 167.111 C 229.499 167.111,228.947 167.487,228.516 167.946 C 227.715 168.801,226.844 168.836,226.844 168.014 C 226.844 167.449,226.216 166.923,225.156 166.597 C 224.448 166.381,224.356 166.477,224.356 167.427 M218.059 168.213 C 216.801 169.574,216.613 169.658,215.240 169.470 C 213.797 169.273,211.768 170.286,212.380 170.899 C 212.780 171.298,216.322 172.421,217.221 172.433 C 217.697 172.439,218.780 172.780,219.628 173.191 C 220.476 173.601,221.407 173.846,221.696 173.735 C 222.402 173.464,222.390 171.420,221.680 171.147 C 221.330 171.013,221.252 170.796,221.461 170.536 C 223.849 167.563,220.668 165.391,218.059 168.213 M63.650 171.289 C 63.653 171.827,63.773 172.095,63.917 171.885 C 64.060 171.675,64.468 171.396,64.823 171.265 C 65.616 170.972,65.278 170.311,64.335 170.311 C 63.817 170.311,63.646 170.556,63.650 171.289 M190.222 171.022 C 190.516 171.212,191.036 171.369,191.378 171.372 C 191.755 171.376,192.000 171.650,192.000 172.068 C 192.000 172.804,192.549 173.349,192.832 172.893 C 193.479 171.845,192.591 170.667,191.159 170.672 C 190.079 170.676,189.830 170.769,190.222 171.022 M162.929 171.959 C 162.701 172.402,162.729 172.958,163.015 173.634 L 163.441 174.646 163.907 173.522 C 164.487 172.122,163.585 170.680,162.929 171.959 M224.203 172.611 C 224.013 173.625,223.807 173.867,223.133 173.867 C 222.213 173.867,221.867 174.458,221.867 176.029 C 221.867 177.690,220.131 176.876,220.100 175.200 C 220.076 173.858,216.217 174.364,212.396 176.210 C 209.386 177.665,208.952 177.786,208.420 177.325 C 207.145 176.219,205.804 176.215,205.931 177.317 C 206.007 177.981,206.278 178.342,206.756 178.417 C 209.981 178.926,212.161 181.161,210.617 182.375 C 209.783 183.031,209.755 183.139,210.276 183.660 C 210.589 183.973,210.844 184.353,210.844 184.504 C 210.844 185.300,212.495 185.475,213.985 184.837 C 215.954 183.995,216.717 184.006,217.604 184.893 C 218.178 185.467,218.595 185.563,219.733 185.381 C 221.214 185.144,223.289 185.747,223.289 186.414 C 223.289 186.618,223.385 186.689,223.503 186.571 C 223.621 186.453,223.465 185.998,223.158 185.558 C 222.711 184.921,222.686 184.653,223.032 184.233 C 223.375 183.818,223.373 183.675,223.022 183.557 C 222.778 183.475,222.578 183.244,222.578 183.043 C 222.578 182.843,222.818 182.772,223.111 182.884 C 223.466 183.021,223.644 182.870,223.644 182.432 C 223.644 182.071,223.868 181.591,224.141 181.364 C 224.413 181.138,224.738 180.414,224.861 179.755 C 224.985 179.096,225.322 178.467,225.610 178.357 C 225.898 178.246,226.135 177.791,226.137 177.344 C 226.139 176.898,226.372 175.773,226.654 174.844 C 226.941 173.897,227.017 173.156,226.827 173.156 C 226.641 173.156,226.489 173.370,226.489 173.633 C 226.489 174.329,224.940 177.148,224.528 177.200 C 223.422 177.341,223.997 174.632,225.301 173.557 C 226.674 172.425,226.653 172.023,225.197 171.585 C 224.547 171.389,224.405 171.536,224.203 172.611 M196.507 172.232 C 196.306 172.755,196.536 173.156,197.037 173.156 C 197.200 173.156,197.333 172.836,197.333 172.444 C 197.333 171.629,196.792 171.490,196.507 172.232 M65.005 174.667 C 64.775 175.947,65.070 176.762,65.719 176.639 C 66.447 176.500,66.697 175.080,66.117 174.380 C 65.514 173.654,65.172 173.742,65.005 174.667 M188.822 175.948 C 188.323 177.153,188.456 180.334,189.013 180.517 C 190.303 180.941,191.674 177.939,191.148 175.842 C 190.818 174.527,189.383 174.593,188.822 175.948 M66.980 175.712 C 66.400 176.651,66.365 181.689,66.938 181.689 C 67.600 181.689,67.911 180.947,67.911 179.373 C 67.911 178.494,68.097 178.122,68.622 177.956 C 69.435 177.697,69.528 176.820,68.838 175.911 C 68.295 175.195,67.362 175.095,66.980 175.712 M223.772 178.933 C 224.331 180.268,224.227 180.622,223.275 180.622 C 222.539 180.622,221.990 179.250,222.350 178.312 C 222.683 177.446,223.252 177.696,223.772 178.933 M199.822 180.710 C 199.822 181.773,199.967 182.004,200.763 182.203 C 201.800 182.464,202.903 181.750,201.980 181.416 C 201.700 181.314,201.100 180.831,200.647 180.341 L 199.822 179.452 199.822 180.710 M187.047 181.433 C 186.572 181.671,186.055 182.346,185.899 182.933 C 185.742 183.519,185.378 184.172,185.089 184.383 C 184.156 185.065,185.501 187.220,186.801 187.127 C 188.172 187.029,188.133 187.135,188.015 183.877 L 187.911 180.999 187.047 181.433 M70.304 182.432 C 69.958 182.634,69.378 182.705,69.015 182.589 C 67.790 182.201,67.506 184.989,68.625 186.412 C 69.018 186.911,69.438 187.813,69.559 188.416 C 69.679 189.018,69.976 189.511,70.218 189.511 C 70.647 189.511,71.111 191.735,71.111 193.789 C 71.111 194.328,71.343 194.857,71.626 194.966 C 71.909 195.075,72.316 195.816,72.531 196.615 C 72.746 197.413,73.066 197.977,73.242 197.868 C 73.563 197.670,74.305 199.825,74.309 200.965 C 74.310 201.301,74.611 201.735,74.977 201.932 C 75.535 202.230,75.649 202.734,75.675 205.034 C 75.700 207.109,75.841 207.854,76.254 208.085 C 76.554 208.253,76.800 208.828,76.800 209.363 C 76.800 209.898,77.120 211.246,77.511 212.359 C 77.902 213.472,78.222 214.711,78.222 215.113 C 78.222 216.003,79.239 216.473,79.675 215.785 C 79.848 215.512,79.992 214.681,79.995 213.938 C 79.998 213.195,80.250 212.104,80.555 211.514 C 81.418 209.844,81.113 208.620,79.733 208.227 C 78.484 207.870,78.349 207.470,78.998 206.045 C 79.609 204.704,80.758 204.986,81.166 206.578 C 81.342 207.262,81.711 207.950,81.987 208.107 C 82.766 208.548,82.625 210.925,81.778 211.651 C 81.274 212.082,81.066 212.702,81.064 213.774 C 81.063 214.607,80.823 215.747,80.531 216.307 C 79.763 217.779,79.821 220.756,80.622 221.052 C 81.611 221.417,81.767 221.888,81.770 224.533 C 81.774 227.197,81.252 229.689,80.689 229.689 C 80.095 229.689,78.930 231.959,79.139 232.710 C 79.551 234.190,80.517 235.693,81.278 236.039 C 82.758 236.714,82.661 240.771,81.179 240.202 C 80.148 239.806,79.655 241.697,80.229 243.841 L 80.448 244.659 81.243 243.913 L 82.038 243.166 82.237 244.162 C 82.379 244.875,82.769 245.283,83.609 245.600 C 84.773 246.040,84.776 246.047,84.020 246.577 C 83.601 246.871,83.032 247.024,82.757 246.919 C 80.812 246.172,79.689 248.339,81.001 250.309 C 81.586 251.187,81.758 251.811,81.591 252.442 C 80.561 256.323,80.965 257.408,83.446 257.417 C 85.267 257.423,85.286 257.394,85.681 253.966 C 85.856 252.445,86.249 250.605,86.555 249.878 C 86.861 249.151,87.111 247.920,87.111 247.144 C 87.111 245.458,87.489 245.156,89.600 245.156 C 91.509 245.156,91.717 245.381,91.740 247.467 C 91.750 248.347,92.067 249.707,92.444 250.489 C 93.317 252.295,93.464 257.682,92.650 257.994 C 91.382 258.481,90.769 257.534,90.502 254.679 C 89.966 248.940,88.953 251.107,89.195 257.475 L 89.244 258.772 92.384 258.641 C 94.261 258.562,95.941 258.292,96.562 257.968 C 97.133 257.670,97.948 257.426,98.374 257.424 C 98.800 257.423,99.459 257.028,99.838 256.545 C 100.217 256.063,100.622 255.762,100.736 255.877 C 101.434 256.574,103.454 255.557,104.048 254.210 C 104.390 253.434,104.799 252.800,104.957 252.800 C 105.464 252.800,105.248 249.102,104.700 248.376 C 104.413 247.997,104.177 247.437,104.176 247.132 C 104.174 246.827,103.944 246.138,103.663 245.600 C 103.220 244.751,103.220 244.494,103.663 243.644 C 104.365 242.299,104.304 241.100,103.461 239.718 C 103.069 239.074,102.677 238.002,102.592 237.336 C 102.507 236.670,102.257 235.456,102.037 234.638 C 101.817 233.821,101.506 231.772,101.346 230.087 C 101.089 227.373,99.695 222.276,98.806 220.800 C 98.312 219.981,98.199 219.675,97.772 218.008 C 97.420 216.634,97.277 216.478,96.510 216.625 C 95.713 216.777,95.644 216.681,95.644 215.403 C 95.644 212.829,93.954 210.341,91.467 209.253 C 90.757 208.943,90.311 208.492,90.311 208.085 C 90.311 207.721,90.013 206.792,89.649 206.022 C 88.992 204.632,88.974 201.956,89.622 201.956 C 89.953 201.956,90.662 204.230,90.665 205.304 C 90.666 205.679,90.768 205.884,90.891 205.761 C 91.015 205.637,91.450 205.771,91.859 206.057 C 93.217 207.008,93.821 205.414,92.610 204.076 C 92.310 203.744,91.904 202.476,91.708 201.258 C 91.421 199.479,91.144 198.868,90.298 198.157 C 89.704 197.656,89.244 196.921,89.244 196.468 C 89.244 194.625,85.772 193.378,84.513 194.769 C 83.894 195.453,83.903 195.498,84.814 196.214 C 85.456 196.719,85.814 197.407,85.946 198.388 L 86.138 199.822 84.740 199.822 C 83.141 199.822,82.757 199.154,82.295 195.564 C 82.029 193.495,81.285 192.000,80.521 192.000 C 79.979 192.000,78.578 189.864,78.578 189.037 C 78.578 188.724,77.898 187.676,77.067 186.708 C 76.236 185.740,75.258 184.522,74.895 184.001 C 74.402 183.294,74.031 183.104,73.434 183.254 C 72.898 183.389,72.422 183.221,71.995 182.750 C 71.268 181.947,71.170 181.929,70.304 182.432 M37.221 182.631 C 37.087 182.765,36.978 183.261,36.978 183.733 C 36.978 184.718,37.796 184.663,37.989 183.666 C 38.125 182.963,37.598 182.254,37.221 182.631 M72.178 184.881 C 72.178 185.764,72.560 186.998,73.197 188.170 C 75.511 192.427,76.257 193.665,77.272 194.932 C 78.993 197.080,78.472 200.639,76.333 201.344 C 74.929 201.807,74.841 201.596,74.874 197.852 L 74.904 194.520 73.873 194.293 C 73.305 194.168,72.783 193.881,72.711 193.655 C 72.640 193.429,72.327 192.324,72.014 191.200 C 71.671 189.962,71.252 189.156,70.952 189.156 C 70.414 189.156,69.785 185.010,70.170 184.007 C 70.664 182.720,72.178 183.378,72.178 184.881 M177.695 184.889 C 177.940 185.280,178.426 185.600,178.776 185.600 C 179.689 185.600,180.267 186.304,180.267 187.416 C 180.267 188.757,179.043 188.410,177.501 186.631 C 176.860 185.891,175.999 185.179,175.588 185.049 C 174.999 184.862,174.944 184.745,175.331 184.500 C 176.168 183.970,177.231 184.145,177.695 184.889 M200.267 184.413 C 200.022 184.512,199.822 185.043,199.822 185.595 L 199.822 186.596 200.889 185.600 C 202.301 184.281,202.003 183.713,200.267 184.413 M204.235 184.468 C 204.003 184.628,204.017 185.320,204.276 186.489 C 204.650 188.180,204.691 188.227,205.114 187.446 C 205.812 186.157,205.131 183.850,204.235 184.468 M206.933 186.823 C 206.933 187.974,207.633 188.361,208.232 187.542 C 208.962 186.543,208.810 185.956,207.822 185.956 C 207.117 185.956,206.933 186.135,206.933 186.823 M51.021 187.381 C 50.653 188.541,51.150 189.511,52.113 189.511 C 52.589 189.511,52.978 189.364,52.978 189.185 C 52.978 189.005,53.071 188.616,53.184 188.320 C 53.321 187.963,53.029 187.594,52.319 187.227 C 51.306 186.703,51.234 186.712,51.021 187.381 M48.196 189.191 C 48.979 194.163,48.285 195.550,45.701 194.179 C 43.622 193.076,43.029 192.366,42.806 190.711 C 42.388 187.606,42.421 187.658,41.236 188.271 C 39.987 188.917,39.943 189.262,40.889 191.026 C 41.294 191.781,41.600 193.032,41.600 193.930 C 41.600 195.277,41.756 195.618,42.667 196.267 C 43.413 196.798,43.733 197.322,43.733 198.014 C 43.733 198.903,44.646 200.178,45.284 200.178 C 46.795 200.178,48.054 201.287,47.501 202.131 C 46.737 203.296,47.080 204.603,48.394 205.539 C 48.959 205.941,49.520 206.667,49.642 207.154 C 49.806 207.805,50.064 208.008,50.621 207.924 C 51.199 207.836,51.546 208.143,52.089 209.225 C 52.480 210.004,53.262 210.887,53.826 211.187 C 54.390 211.488,55.223 212.093,55.676 212.533 C 56.676 213.503,57.301 213.542,58.078 212.683 C 58.855 211.824,58.821 211.095,57.968 210.322 C 57.584 209.975,57.009 208.790,56.692 207.690 C 56.374 206.589,55.872 205.418,55.576 205.087 C 55.280 204.757,54.925 203.557,54.786 202.421 C 54.647 201.285,54.263 199.844,53.933 199.218 C 53.603 198.592,53.333 197.863,53.333 197.599 C 53.333 197.334,52.779 196.580,52.102 195.923 C 51.218 195.067,50.750 194.195,50.446 192.838 C 50.159 191.552,49.813 190.880,49.367 190.738 C 48.878 190.583,48.711 190.179,48.711 189.153 C 48.711 188.395,48.527 187.662,48.303 187.523 C 48.001 187.336,47.973 187.771,48.196 189.191 M183.703 190.068 C 183.999 190.841,183.247 191.567,182.708 191.028 C 182.253 190.573,182.535 189.511,183.111 189.511 C 183.319 189.511,183.585 189.762,183.703 190.068 M23.200 190.458 C 21.763 191.038,22.955 193.067,24.733 193.067 C 25.342 193.067,25.649 193.316,25.805 193.937 C 25.925 194.415,26.408 195.059,26.878 195.367 C 27.349 195.675,27.733 196.169,27.733 196.464 C 27.733 197.184,27.011 197.446,24.486 197.644 C 23.762 197.700,23.459 198.786,23.719 200.390 C 23.877 201.365,24.048 201.576,24.551 201.417 C 24.900 201.306,25.288 201.382,25.413 201.586 C 25.545 201.799,25.314 201.956,24.868 201.956 C 24.234 201.956,24.137 202.100,24.328 202.756 C 24.456 203.196,24.656 204.076,24.771 204.711 C 24.887 205.347,25.161 205.880,25.380 205.896 C 25.980 205.939,23.743 206.899,22.998 206.917 C 22.413 206.932,19.678 209.422,20.247 209.422 C 21.305 209.422,22.075 210.944,21.391 211.683 C 20.629 212.506,20.305 213.963,20.732 214.649 C 20.895 214.911,20.583 215.382,19.921 215.871 C 19.329 216.309,18.847 216.757,18.850 216.867 C 18.869 217.577,19.683 218.038,21.160 218.176 C 22.096 218.264,22.994 218.416,23.154 218.516 C 23.315 218.615,23.850 218.432,24.343 218.109 C 25.171 217.566,25.350 217.565,26.672 218.094 C 27.516 218.432,29.135 218.667,30.617 218.667 C 32.965 218.667,33.193 218.737,34.067 219.733 C 34.582 220.320,35.277 220.800,35.611 220.800 C 36.010 220.800,36.258 221.136,36.332 221.778 C 36.423 222.570,36.647 222.778,37.511 222.873 C 38.647 222.998,40.282 224.255,39.968 224.763 C 39.475 225.561,37.352 225.067,36.815 224.030 C 36.476 223.374,35.893 222.908,35.231 222.762 C 34.654 222.636,34.000 222.312,33.777 222.044 C 33.260 221.420,30.011 221.009,28.122 221.328 L 26.667 221.574 26.667 224.165 C 26.667 227.253,26.571 227.359,23.330 227.858 C 21.711 228.107,20.661 228.473,20.227 228.939 C 19.836 229.358,18.885 229.731,17.874 229.861 C 15.489 230.167,12.440 231.772,10.075 233.968 C 9.651 234.361,8.699 234.893,7.957 235.150 C 5.775 235.905,5.395 236.766,5.267 241.244 L 5.156 245.156 6.400 245.061 C 10.097 244.780,11.370 244.915,12.683 245.727 C 15.513 247.475,28.248 247.285,28.939 245.483 C 29.078 245.123,29.754 244.978,31.295 244.978 C 32.490 244.978,33.904 244.747,34.456 244.461 C 35.297 244.027,36.348 244.002,41.105 244.309 C 48.999 244.817,48.164 244.391,49.266 248.477 C 49.406 248.994,49.983 249.512,50.790 249.843 C 52.449 250.525,54.044 252.026,54.044 252.904 C 54.044 253.280,54.452 253.907,54.949 254.298 C 55.824 254.986,55.834 255.040,55.258 255.920 C 53.918 257.964,59.456 258.544,61.272 256.549 C 62.567 255.128,63.378 255.122,65.055 256.524 C 65.881 257.213,66.914 257.778,67.352 257.778 C 68.750 257.778,68.732 258.298,67.321 258.699 C 65.147 259.316,65.564 260.070,68.148 260.194 C 70.552 260.309,71.320 260.828,70.926 262.069 C 70.563 263.210,64.787 262.510,63.289 261.144 C 61.553 259.560,58.353 258.520,55.898 258.743 C 53.891 258.925,53.562 258.853,52.256 257.948 C 51.467 257.401,49.826 256.451,48.610 255.837 C 47.037 255.042,46.246 254.395,45.867 253.590 C 45.122 252.011,44.164 252.123,41.576 254.091 C 39.246 255.863,36.267 256.692,36.267 255.568 C 36.267 254.973,37.308 253.941,38.491 253.362 C 38.930 253.148,39.592 252.353,39.962 251.597 L 40.634 250.222 42.533 250.418 C 46.074 250.783,47.307 247.915,43.853 247.344 C 41.335 246.928,40.568 247.072,39.411 248.178 C 38.169 249.364,37.846 249.453,37.183 248.789 C 36.836 248.443,35.033 248.356,29.652 248.428 C 20.007 248.558,11.696 248.807,11.531 248.973 C 11.174 249.330,12.655 250.756,13.897 251.254 C 15.733 251.988,15.659 252.444,13.707 252.444 C 12.616 252.444,12.024 252.265,11.801 251.867 C 11.522 251.369,11.298 251.349,10.171 251.721 C 8.149 252.388,7.750 253.289,8.018 256.584 C 8.142 258.120,8.294 260.018,8.355 260.800 C 8.415 261.582,8.797 262.942,9.202 263.822 C 9.608 264.702,9.943 265.837,9.948 266.345 C 9.952 266.852,10.284 267.565,10.686 267.928 C 11.256 268.445,11.372 268.864,11.215 269.850 C 10.963 271.435,11.410 272.285,12.075 271.483 C 12.392 271.101,13.169 270.933,14.621 270.933 C 15.777 270.933,16.711 270.774,16.711 270.578 C 16.711 270.382,16.404 270.222,16.029 270.222 C 13.031 270.222,14.283 266.260,17.600 265.252 C 18.996 264.827,19.609 264.360,20.776 262.829 C 22.217 260.938,22.228 260.932,23.830 261.134 C 25.747 261.375,26.796 260.785,27.517 259.060 C 27.834 258.301,28.416 257.735,29.201 257.422 C 30.801 256.784,30.782 256.815,30.053 256.010 C 29.186 255.052,29.736 254.871,33.100 255.006 C 36.308 255.134,37.120 256.534,34.363 257.186 C 33.311 257.435,32.886 257.767,32.529 258.622 C 32.274 259.233,31.741 260.145,31.345 260.648 C 30.935 261.169,30.576 262.242,30.512 263.137 L 30.400 264.711 27.961 264.611 C 26.537 264.553,25.322 264.677,25.043 264.909 C 24.780 265.127,24.398 265.203,24.195 265.077 C 23.491 264.642,23.013 266.476,23.381 268.203 C 23.882 270.551,21.072 274.764,18.114 276.098 C 17.196 276.512,16.711 276.963,16.711 277.405 C 16.711 278.348,15.880 279.843,14.789 280.862 C 14.282 281.336,13.867 282.008,13.867 282.355 C 13.867 282.703,13.617 283.126,13.313 283.297 C 12.775 283.598,12.350 285.127,11.168 291.022 C 10.855 292.587,10.373 294.119,10.099 294.428 C 9.197 295.443,9.472 297.894,10.637 299.220 C 11.378 300.064,11.728 300.261,11.863 299.909 C 11.967 299.638,12.660 299.305,13.404 299.169 C 14.147 299.032,15.122 298.558,15.571 298.116 C 16.019 297.673,16.899 297.064,17.526 296.761 C 18.153 296.459,19.133 295.710,19.703 295.097 C 20.273 294.485,21.113 293.739,21.570 293.440 C 22.026 293.141,22.400 292.703,22.400 292.466 C 22.400 291.909,25.541 288.579,26.578 288.037 C 27.224 287.700,27.378 287.317,27.378 286.044 C 27.378 284.202,27.950 283.733,30.199 283.733 C 31.162 283.733,31.644 283.576,31.644 283.262 C 31.644 282.404,33.262 281.253,34.898 280.947 C 35.784 280.782,36.855 280.301,37.277 279.879 C 37.699 279.457,38.220 279.111,38.434 279.111 C 38.649 279.111,39.526 278.494,40.383 277.739 C 41.615 276.654,42.325 276.322,43.774 276.150 C 45.014 276.003,45.763 275.709,46.093 275.239 C 46.360 274.858,47.098 274.434,47.734 274.298 C 48.369 274.162,49.102 273.879,49.362 273.669 C 49.936 273.206,52.359 272.808,56.974 272.418 C 58.879 272.258,60.479 272.058,60.530 271.974 C 60.581 271.891,60.798 271.502,61.013 271.111 C 61.279 270.629,62.052 270.270,63.418 269.995 C 64.525 269.773,65.694 269.373,66.015 269.107 C 66.393 268.793,67.502 268.627,69.154 268.636 L 71.709 268.650 72.452 267.295 L 73.194 265.939 72.314 265.362 C 71.343 264.726,71.385 262.976,72.389 262.183 C 73.031 261.676,73.034 260.978,72.394 260.978 C 71.835 260.978,71.468 260.228,71.464 259.082 C 71.463 258.605,71.070 258.088,70.434 257.726 C 69.777 257.353,69.316 256.730,69.156 256.001 C 69.018 255.374,68.614 254.569,68.257 254.213 C 67.320 253.276,66.844 252.266,66.844 251.215 C 66.844 250.125,66.183 249.810,63.111 249.435 C 61.938 249.292,60.418 248.932,59.733 248.635 C 59.049 248.338,57.347 248.064,55.952 248.026 C 53.308 247.954,51.556 247.234,51.556 246.221 C 51.556 244.999,55.350 245.121,56.696 246.386 C 57.530 247.169,58.492 247.295,59.812 246.793 C 60.397 246.571,60.854 246.627,61.338 246.981 C 61.827 247.338,62.500 247.418,63.637 247.253 C 66.447 246.846,67.270 246.029,65.624 245.280 C 65.148 245.063,64.568 244.423,64.333 243.858 C 63.795 242.558,62.044 241.067,61.056 241.067 C 60.641 241.067,59.813 240.606,59.217 240.043 C 58.621 239.480,57.093 238.678,55.822 238.260 C 51.359 236.793,51.559 236.276,56.700 235.985 C 61.561 235.710,61.805 235.484,58.459 234.356 C 56.340 233.642,55.558 233.193,55.133 232.447 C 54.538 231.401,54.086 231.318,51.604 231.797 C 50.325 232.044,49.941 231.986,49.418 231.463 C 49.069 231.114,48.325 230.727,47.764 230.604 C 47.203 230.481,46.138 229.825,45.397 229.146 C 44.656 228.467,43.887 227.911,43.689 227.911 C 43.491 227.911,43.379 227.551,43.442 227.111 C 43.566 226.239,43.902 226.204,47.529 226.686 C 51.033 227.151,53.618 224.774,52.466 222.145 C 52.185 221.503,51.862 220.538,51.748 220.000 C 51.582 219.209,51.347 219.022,50.526 219.022 C 49.288 219.022,48.850 218.538,48.527 216.808 C 48.304 215.613,48.209 215.520,47.561 215.867 C 46.589 216.387,42.466 215.926,41.757 215.217 C 40.621 214.081,41.268 213.529,44.093 213.223 C 45.558 213.064,46.887 212.805,47.047 212.647 C 47.442 212.257,46.388 209.819,45.711 209.559 C 45.306 209.404,45.257 209.187,45.518 208.699 C 46.104 207.603,45.926 207.332,44.356 206.926 C 43.524 206.711,42.564 206.454,42.222 206.355 C 41.753 206.219,41.600 205.795,41.600 204.628 C 41.600 203.050,40.591 201.860,38.180 200.597 C 37.766 200.381,37.334 199.736,37.220 199.164 C 37.072 198.426,36.709 198.020,35.963 197.760 C 35.386 197.559,34.279 196.821,33.503 196.120 C 32.727 195.418,31.815 194.844,31.477 194.844 C 31.139 194.844,30.281 194.263,29.570 193.553 C 28.860 192.842,27.796 192.095,27.206 191.892 C 26.616 191.689,25.924 191.230,25.669 190.872 C 25.225 190.252,24.155 190.072,23.200 190.458 M195.087 192.231 C 194.722 192.596,194.795 195.483,195.175 195.718 C 195.668 196.022,195.982 195.312,195.982 193.896 C 195.982 192.624,195.532 191.786,195.087 192.231 M10.844 193.778 C 10.724 193.973,10.964 194.133,11.378 194.133 C 11.792 194.133,12.032 193.973,11.911 193.778 C 11.790 193.582,11.550 193.422,11.378 193.422 C 11.205 193.422,10.965 193.582,10.844 193.778 M198.287 194.981 C 198.171 195.284,198.217 195.621,198.391 195.728 C 198.845 196.008,199.115 195.426,198.782 194.887 C 198.561 194.529,198.453 194.550,198.287 194.981 M225.669 195.088 C 225.538 195.301,225.685 195.687,225.997 195.945 C 226.308 196.204,226.702 196.782,226.873 197.230 C 227.043 197.678,227.458 198.044,227.794 198.044 C 228.274 198.044,228.171 197.796,227.313 196.889 C 226.712 196.253,226.150 195.501,226.064 195.218 C 225.962 194.879,225.826 194.834,225.669 195.088 M193.711 197.981 C 193.617 198.620,193.655 199.213,193.794 199.299 C 195.158 200.142,195.343 204.264,194.081 205.671 C 193.914 205.857,193.778 206.460,193.778 207.012 L 193.778 208.014 195.243 207.267 C 196.697 206.525,196.706 206.508,196.433 205.038 C 196.282 204.222,196.136 202.756,196.107 201.778 C 196.043 199.555,195.660 198.400,194.987 198.400 C 194.700 198.400,194.334 198.045,194.174 197.610 C 193.906 196.886,193.867 196.918,193.711 197.981 M50.133 198.963 C 50.133 200.117,50.004 200.545,49.689 200.430 C 49.444 200.340,49.308 200.047,49.386 199.778 C 49.464 199.509,49.603 198.849,49.693 198.311 C 49.941 196.845,50.133 197.131,50.133 198.963 M174.331 197.915 C 173.657 198.386,173.579 198.687,173.751 200.140 C 173.931 201.661,173.863 201.876,173.031 202.422 C 171.226 203.604,174.284 205.663,176.547 204.788 C 177.126 204.564,177.911 204.319,178.291 204.242 C 179.677 203.963,180.146 203.094,179.121 202.704 C 177.981 202.271,177.818 201.834,178.039 199.809 C 178.281 197.581,176.277 196.557,174.331 197.915 M205.542 198.310 C 201.235 198.512,199.946 199.836,202.061 201.886 C 204.083 203.846,207.689 203.116,208.000 200.685 C 208.218 198.984,209.217 198.608,210.169 199.870 L 210.798 200.703 211.177 199.706 C 211.766 198.157,211.669 198.040,209.867 198.115 C 208.938 198.154,206.992 198.241,205.542 198.310 M190.426 200.732 C 190.057 202.204,190.552 204.089,191.307 204.089 C 192.114 204.089,192.318 203.766,192.897 201.568 L 193.358 199.822 192.006 199.822 C 190.853 199.822,190.621 199.956,190.426 200.732 M185.165 202.235 C 184.671 202.766,184.339 203.398,184.428 203.639 C 184.680 204.327,186.667 203.159,186.667 202.323 C 186.667 201.230,186.131 201.198,185.165 202.235 M208.378 202.645 C 207.955 202.913,207.948 203.064,208.333 203.528 C 209.008 204.342,209.422 204.217,209.422 203.200 C 209.422 202.251,209.193 202.129,208.378 202.645 M169.130 205.256 C 168.983 206.605,169.010 207.923,169.191 208.247 C 169.745 209.238,169.973 207.755,169.666 205.156 L 169.393 202.844 169.130 205.256 M87.111 206.604 C 87.111 208.807,87.034 209.104,86.489 209.001 C 85.310 208.777,85.577 204.089,86.768 204.089 C 86.957 204.089,87.111 205.221,87.111 206.604 M213.404 204.516 C 212.621 205.299,212.872 206.642,213.778 206.512 C 214.395 206.424,214.555 206.197,214.479 205.518 C 214.349 204.369,213.936 203.984,213.404 204.516 M36.931 205.633 C 37.450 206.258,37.091 206.578,35.873 206.578 C 34.659 206.578,34.257 206.037,35.104 205.544 C 35.963 205.044,36.463 205.068,36.931 205.633 M72.178 207.057 C 72.178 207.724,72.481 208.596,72.867 209.041 C 73.246 209.479,73.658 210.301,73.783 210.870 C 74.168 212.623,74.667 212.414,74.667 210.499 C 74.667 209.218,74.511 208.629,74.133 208.484 C 73.840 208.372,73.600 207.990,73.600 207.635 C 73.600 206.611,73.210 205.867,72.673 205.867 C 72.348 205.867,72.178 206.277,72.178 207.057 M222.794 206.429 C 222.675 206.738,222.578 207.312,222.578 207.703 C 222.578 208.589,223.417 208.378,223.597 207.446 C 223.669 207.076,223.989 206.574,224.308 206.331 C 224.817 205.944,224.773 205.888,223.949 205.878 C 223.412 205.872,222.917 206.108,222.794 206.429 M227.473 207.354 C 227.108 208.439,227.582 209.039,228.480 208.630 C 229.300 208.256,229.681 207.289,229.007 207.289 C 228.827 207.289,228.444 207.198,228.155 207.087 C 227.867 206.977,227.560 207.097,227.473 207.354 M32.473 208.043 C 33.915 209.418,34.684 209.833,36.375 210.146 C 38.914 210.618,40.386 212.314,38.637 212.753 C 37.122 213.134,34.328 212.017,33.969 210.888 C 33.832 210.456,33.165 210.070,32.079 209.794 C 28.776 208.957,27.347 208.034,28.533 207.506 C 29.293 207.167,31.932 207.527,32.473 208.043 M210.326 207.620 C 210.214 207.802,210.284 208.051,210.483 208.174 C 210.907 208.436,211.556 208.104,211.556 207.623 C 211.556 207.191,210.593 207.188,210.326 207.620 M197.729 208.600 C 197.759 209.150,197.669 209.870,197.529 210.201 C 197.235 210.894,200.222 212.622,201.713 212.622 C 203.010 212.622,205.580 210.614,205.445 209.707 C 205.270 208.537,204.265 208.086,203.459 208.815 C 202.437 209.740,200.611 209.623,200.469 208.622 C 200.275 207.256,197.654 207.235,197.729 208.600 M175.352 208.952 C 175.444 209.755,175.667 209.979,176.471 210.071 C 177.384 210.175,177.464 210.095,177.359 209.182 C 177.267 208.379,177.044 208.155,176.241 208.063 C 175.327 207.958,175.247 208.038,175.352 208.952 M171.378 209.201 C 171.378 209.275,171.618 209.534,171.911 209.778 C 172.348 210.140,172.444 210.116,172.444 209.644 C 172.444 209.326,172.204 209.067,171.911 209.067 C 171.618 209.067,171.378 209.127,171.378 209.201 M167.154 210.272 C 165.994 210.915,165.333 212.669,165.333 215.108 C 165.333 217.275,165.069 217.709,163.528 218.076 C 161.859 218.473,161.560 219.989,163.030 220.603 C 163.710 220.887,164.267 221.342,164.267 221.614 C 164.267 222.674,163.268 225.310,162.368 226.627 C 161.590 227.764,161.422 228.409,161.422 230.251 C 161.422 231.483,161.262 232.590,161.067 232.711 C 160.369 233.143,160.684 235.558,161.600 236.800 C 162.089 237.463,162.491 238.414,162.494 238.914 C 162.508 241.267,164.508 241.142,165.504 238.726 C 166.481 236.358,168.844 236.528,168.590 238.949 C 168.438 240.399,169.202 242.121,169.646 241.328 C 170.133 240.457,169.655 237.511,169.026 237.511 C 168.755 237.511,168.519 237.391,168.502 237.244 C 168.178 234.493,168.260 233.517,168.869 232.909 C 169.231 232.547,169.643 231.714,169.785 231.058 C 170.157 229.333,171.272 227.281,172.068 226.855 C 173.182 226.260,173.447 223.468,172.488 222.446 C 171.539 221.436,171.520 220.037,172.444 219.200 C 172.922 218.768,173.156 218.105,173.156 217.181 C 173.156 216.061,173.312 215.745,173.996 215.485 C 175.150 215.046,175.377 214.232,174.757 212.749 C 174.059 211.077,173.360 211.384,173.226 213.421 C 173.144 214.677,172.924 215.181,172.275 215.606 C 171.811 215.910,171.329 216.483,171.203 216.879 C 170.499 219.098,169.600 217.639,169.600 214.277 C 169.600 210.185,169.021 209.237,167.154 210.272 M193.557 211.005 C 193.267 211.761,193.782 212.477,194.172 211.860 C 194.592 211.198,194.566 210.489,194.122 210.489 C 193.920 210.489,193.666 210.721,193.557 211.005 M66.188 211.999 C 65.665 212.522,65.659 213.783,66.177 214.301 C 66.730 214.854,68.366 214.104,68.103 213.419 C 67.997 213.144,67.911 212.778,67.911 212.606 C 67.911 212.013,66.626 211.560,66.188 211.999 M184.533 213.829 C 184.533 215.667,184.596 215.822,185.344 215.822 C 186.627 215.822,186.948 217.278,186.747 222.175 L 186.569 226.489 185.617 226.489 C 184.876 226.489,184.531 226.769,184.063 227.752 C 183.731 228.447,183.302 228.918,183.108 228.798 C 182.600 228.484,182.660 222.815,183.176 222.299 C 183.408 222.068,183.485 221.767,183.348 221.630 C 183.211 221.493,182.910 221.570,182.679 221.801 C 181.950 222.530,180.981 222.276,180.593 221.255 C 180.271 220.409,180.339 220.206,181.135 219.626 C 182.015 218.984,182.423 217.165,181.776 216.765 C 181.075 216.332,179.911 217.927,179.911 219.320 C 179.911 220.106,179.681 220.979,179.401 221.260 C 179.056 221.605,179.007 221.887,179.250 222.130 C 179.449 222.329,179.745 223.030,179.909 223.690 C 180.699 226.871,181.653 229.803,181.964 230.002 C 182.153 230.123,182.379 231.595,182.465 233.272 C 182.584 235.596,182.807 236.621,183.400 237.581 C 183.828 238.273,184.180 239.141,184.183 239.509 C 184.194 240.868,184.694 241.185,185.868 240.579 C 186.458 240.273,187.541 240.071,188.274 240.129 C 189.445 240.221,189.688 240.096,190.275 239.102 C 190.696 238.389,191.533 237.727,192.538 237.312 L 194.133 236.654 194.133 234.772 C 194.133 233.736,193.973 232.889,193.778 232.889 C 193.344 232.889,193.316 231.119,193.739 230.451 C 193.923 230.160,194.328 230.058,194.758 230.195 C 195.228 230.344,195.543 230.235,195.680 229.877 C 195.795 229.578,196.174 229.333,196.522 229.333 C 197.072 229.333,197.156 228.990,197.156 226.735 C 197.156 224.399,197.258 224.015,198.165 222.937 C 198.909 222.053,199.125 221.489,198.986 220.794 C 198.829 220.013,199.067 219.613,200.373 218.459 C 202.454 216.621,202.405 216.533,199.289 216.533 C 196.456 216.533,196.279 216.631,197.219 217.670 C 198.122 218.668,198.162 222.578,197.270 222.578 C 196.547 222.578,196.498 222.391,196.607 220.034 C 196.673 218.594,196.578 218.345,195.880 218.123 C 195.048 217.859,194.133 218.645,194.133 219.624 C 194.133 219.879,193.893 220.089,193.599 220.089 C 193.270 220.089,192.908 220.673,192.658 221.608 C 192.434 222.443,191.875 223.410,191.415 223.757 L 190.578 224.389 190.578 222.618 C 190.578 221.160,190.703 220.808,191.289 220.622 C 191.811 220.456,192.000 220.084,192.000 219.220 C 192.000 218.572,192.240 217.843,192.533 217.600 C 193.173 217.069,193.236 215.423,192.640 214.827 C 192.372 214.559,191.017 214.398,188.996 214.395 C 185.136 214.388,184.353 214.068,185.619 213.014 C 186.097 212.616,186.302 212.285,186.074 212.278 C 185.845 212.272,185.405 212.170,185.096 212.051 C 184.624 211.870,184.533 212.157,184.533 213.829 M236.595 213.378 C 236.239 213.954,236.884 214.316,237.831 214.072 L 238.684 213.851 237.755 213.428 C 237.116 213.137,236.753 213.121,236.595 213.378 M75.449 213.645 C 74.609 214.164,75.319 220.034,76.300 220.677 C 76.747 220.970,77.189 221.557,77.282 221.983 C 77.375 222.408,77.403 221.796,77.344 220.622 C 77.142 216.577,76.217 213.170,75.449 213.645 M84.279 216.110 C 84.286 216.832,84.521 217.822,84.800 218.311 C 85.079 218.800,85.309 219.680,85.310 220.267 C 85.311 221.161,85.253 221.233,84.949 220.711 C 84.750 220.369,84.372 220.089,84.109 220.089 C 83.295 220.089,82.704 215.371,83.427 214.647 C 83.889 214.185,84.267 214.834,84.279 216.110 M88.533 220.988 C 88.533 225.800,88.396 225.325,91.327 230.665 C 91.755 231.446,91.725 231.659,91.060 232.558 C 90.157 233.780,90.053 236.475,90.831 238.482 C 91.338 239.787,91.546 241.050,91.433 242.133 C 91.389 242.553,90.829 242.667,88.800 242.667 L 86.222 242.667 86.115 240.595 C 86.035 239.048,86.198 238.130,86.760 236.969 C 87.896 234.622,87.643 232.746,86.170 232.602 C 85.086 232.497,85.066 232.465,85.515 231.536 C 85.770 231.009,86.090 229.258,86.226 227.644 C 86.363 226.031,86.638 224.711,86.839 224.711 C 87.063 224.711,87.127 224.133,87.005 223.220 C 86.894 222.394,86.981 221.402,87.199 220.997 C 87.417 220.596,87.560 219.732,87.517 219.078 C 87.426 217.679,87.735 216.533,88.202 216.533 C 88.389 216.533,88.533 218.470,88.533 220.988 M66.196 217.680 C 65.672 218.204,65.655 219.905,66.163 220.856 C 66.445 221.383,66.432 221.857,66.112 222.628 C 65.635 223.780,66.116 226.166,67.002 227.053 C 67.251 227.301,67.567 228.906,67.706 230.618 C 67.912 233.158,68.116 233.918,68.810 234.743 C 69.278 235.299,69.754 236.350,69.867 237.077 C 70.241 239.470,71.204 242.449,71.662 242.624 C 71.909 242.719,72.219 243.289,72.351 243.890 C 72.483 244.492,72.738 244.893,72.918 244.782 C 73.360 244.509,73.335 240.809,72.889 240.533 C 72.693 240.412,72.533 239.692,72.533 238.933 C 72.533 238.174,72.693 237.454,72.889 237.333 C 73.537 236.933,73.258 235.865,72.239 234.847 C 71.286 233.894,71.258 233.775,71.690 232.565 C 72.493 230.321,72.320 229.102,71.096 228.379 C 70.502 228.028,69.954 227.419,69.879 227.026 C 69.708 226.125,69.594 221.617,69.691 219.583 C 69.756 218.214,67.105 216.770,66.196 217.680 M168.318 218.162 C 168.956 219.827,168.302 220.965,166.993 220.467 C 165.820 220.021,165.745 218.917,166.835 218.153 C 167.826 217.459,168.048 217.460,168.318 218.162 M173.579 220.116 C 173.649 220.326,173.859 220.498,174.044 220.498 C 174.230 220.498,174.440 220.326,174.510 220.116 C 174.580 219.905,174.370 219.733,174.044 219.733 C 173.719 219.733,173.509 219.905,173.579 220.116 M228.533 224.138 C 227.634 224.823,227.769 225.970,228.848 226.819 C 230.146 227.840,231.395 227.787,231.668 226.700 C 231.879 225.860,230.997 224.000,230.388 224.000 C 230.231 224.000,229.890 223.925,229.629 223.832 C 229.369 223.740,228.876 223.878,228.533 224.138 M16.800 225.316 C 15.707 226.065,15.796 226.489,17.046 226.489 C 18.288 226.489,18.627 226.090,18.033 225.325 C 17.642 224.822,17.522 224.821,16.800 225.316 M189.691 228.356 C 190.285 231.604,190.117 232.674,188.978 232.882 C 188.009 233.058,187.909 233.206,187.886 234.494 C 187.808 238.982,186.829 240.506,185.511 238.191 C 184.317 236.092,184.902 232.889,186.480 232.889 C 187.352 232.889,187.378 232.819,187.378 230.471 C 187.378 227.982,187.731 227.200,188.855 227.200 C 189.278 227.200,189.547 227.571,189.691 228.356 M222.299 228.626 C 221.433 229.153,220.785 229.282,219.794 229.124 C 217.725 228.793,217.253 230.296,218.481 233.310 C 218.673 233.783,218.419 234.001,217.281 234.342 C 215.568 234.855,213.518 236.927,213.174 238.493 C 213.031 239.147,212.436 239.973,211.711 240.527 C 211.039 241.039,210.489 241.694,210.489 241.982 C 210.489 242.271,209.769 242.941,208.889 243.473 C 207.092 244.558,206.664 246.793,207.824 249.018 C 208.117 249.579,208.356 250.319,208.356 250.664 C 208.356 251.009,208.716 251.542,209.156 251.849 L 209.956 252.407 208.985 252.426 C 207.628 252.452,207.250 253.935,208.312 255.065 C 208.727 255.507,209.070 256.018,209.075 256.201 C 209.082 256.494,210.608 257.941,212.320 259.276 C 212.883 259.716,216.884 269.358,216.893 270.298 C 216.896 270.549,217.304 271.467,217.801 272.336 C 218.297 273.205,218.870 274.693,219.074 275.642 C 219.291 276.653,219.725 277.544,220.122 277.792 C 220.640 278.116,220.800 278.629,220.800 279.969 C 220.800 280.945,221.016 281.970,221.288 282.283 C 221.998 283.099,222.281 286.222,221.645 286.222 C 221.376 286.222,221.156 286.068,221.156 285.879 C 221.156 285.690,220.676 284.989,220.089 284.321 C 219.502 283.653,219.022 282.774,219.022 282.369 C 219.022 281.963,218.606 281.024,218.097 280.282 C 217.589 279.540,216.782 278.059,216.305 276.990 C 215.828 275.921,215.226 274.801,214.967 274.501 C 214.708 274.201,214.393 273.161,214.266 272.190 C 214.137 271.197,213.805 270.294,213.507 270.128 C 213.216 269.965,212.978 269.659,212.978 269.448 C 212.978 269.237,212.426 268.454,211.752 267.708 C 211.079 266.962,210.354 265.708,210.142 264.922 C 209.931 264.136,209.453 263.280,209.082 263.019 C 208.710 262.759,208.296 262.109,208.162 261.575 C 208.028 261.041,207.577 260.424,207.159 260.204 C 206.188 259.693,205.879 259.218,205.872 258.222 C 205.869 257.783,205.474 256.663,204.994 255.734 C 204.515 254.805,203.939 253.534,203.715 252.910 C 203.414 252.069,203.022 251.712,202.202 251.532 C 201.593 251.398,200.640 250.952,200.085 250.542 C 198.740 249.548,197.512 250.187,196.271 252.526 C 195.565 253.858,195.241 254.157,194.660 254.011 C 194.260 253.911,193.458 254.076,192.877 254.379 C 191.401 255.149,189.407 255.090,188.651 254.254 C 188.313 253.881,187.608 253.468,187.085 253.338 C 185.853 253.030,184.889 252.149,184.889 251.332 C 184.889 250.800,184.695 250.723,183.807 250.901 C 182.337 251.195,181.715 250.308,181.700 247.896 C 181.692 246.557,181.496 245.808,181.020 245.296 C 180.652 244.901,180.256 243.985,180.140 243.260 C 179.863 241.532,178.598 238.929,178.382 239.644 C 178.294 239.938,177.990 240.978,177.708 241.956 C 177.106 244.038,176.418 244.163,174.851 242.473 L 173.880 241.426 173.378 242.224 C 173.101 242.663,172.772 243.904,172.645 244.981 C 172.380 247.237,172.255 247.468,170.945 248.143 C 170.414 248.417,169.843 249.048,169.678 249.545 C 169.406 250.360,169.317 250.234,168.759 248.246 C 168.419 247.035,168.078 246.044,168.002 246.044 C 166.239 246.044,164.577 249.057,165.712 250.192 C 165.981 250.461,165.877 250.628,165.357 250.764 C 164.713 250.932,164.622 250.795,164.622 249.646 C 164.622 247.146,162.271 245.670,161.149 247.467 C 160.251 248.905,157.430 248.235,157.583 246.621 C 157.680 245.601,157.594 245.502,156.525 245.399 C 155.173 245.269,154.311 246.716,154.311 249.115 C 154.311 250.896,153.833 250.315,153.750 248.434 C 153.612 245.281,152.182 243.841,151.404 246.072 L 151.022 247.167 150.178 245.682 C 149.148 243.868,149.365 243.419,151.156 243.659 C 153.990 244.039,155.586 240.440,154.454 236.222 C 153.808 233.814,149.830 234.603,150.130 237.079 C 150.328 238.715,149.790 240.000,148.908 240.000 C 148.542 240.000,147.858 240.251,147.389 240.559 C 146.437 241.182,145.067 240.754,145.067 239.833 C 145.067 238.347,145.763 237.511,147.001 237.511 C 148.540 237.511,149.129 236.656,148.456 235.399 C 148.016 234.577,147.989 234.572,147.770 235.262 C 147.630 235.704,146.998 236.143,146.127 236.404 L 144.711 236.829 144.711 239.596 L 144.711 242.364 146.032 243.059 C 147.402 243.781,148.570 246.373,147.307 245.889 C 147.019 245.778,145.878 245.587,144.770 245.463 C 143.662 245.340,142.476 244.995,142.133 244.698 C 141.780 244.390,141.511 244.323,141.511 244.543 C 141.511 245.254,140.073 245.429,139.382 244.804 C 138.848 244.320,138.581 244.287,137.947 244.627 C 137.384 244.928,137.061 244.936,136.780 244.655 C 135.566 243.442,132.539 244.523,131.334 246.601 C 130.949 247.265,130.910 247.258,130.206 246.400 L 129.477 245.511 129.137 246.400 C 128.950 246.889,128.738 247.598,128.665 247.975 C 128.435 249.171,127.870 248.767,127.458 247.111 C 127.137 245.822,126.927 245.536,126.374 245.639 C 125.997 245.709,124.649 245.794,123.378 245.827 C 122.107 245.860,120.890 245.997,120.675 246.132 C 120.459 246.267,119.979 246.147,119.608 245.867 C 118.830 245.278,116.416 245.160,116.085 245.695 C 115.763 246.216,115.200 245.762,115.200 244.981 C 115.200 244.233,114.184 243.777,113.285 244.122 C 112.218 244.532,110.933 247.209,110.933 249.023 C 110.933 249.993,110.635 251.280,110.222 252.089 C 109.831 252.856,109.511 253.969,109.511 254.564 C 109.511 255.459,109.369 255.644,108.681 255.644 C 108.207 255.644,107.443 256.102,106.900 256.711 C 106.378 257.298,105.720 257.778,105.440 257.778 C 104.926 257.778,102.400 259.142,102.400 259.419 C 102.400 259.501,103.080 259.526,103.911 259.473 L 105.422 259.378 105.526 261.926 C 105.596 263.642,105.389 265.419,104.892 267.364 C 104.275 269.784,104.160 271.273,104.186 276.548 C 104.203 280.086,104.050 283.390,103.837 284.089 C 103.629 284.773,103.297 286.373,103.099 287.644 C 102.621 290.714,102.114 291.911,101.290 291.911 C 100.404 291.911,100.447 292.313,101.422 293.154 C 102.261 293.878,103.258 294.215,102.914 293.658 C 102.804 293.479,103.003 293.336,103.357 293.339 C 103.711 293.342,104.585 292.664,105.301 291.832 L 106.601 290.320 107.367 291.012 C 107.814 291.417,108.234 291.563,108.377 291.364 C 109.535 289.750,110.933 290.706,110.933 293.110 C 110.933 293.783,111.166 294.039,111.931 294.207 C 112.514 294.335,113.188 294.865,113.551 295.480 C 114.294 296.738,115.355 296.846,116.491 295.778 L 117.295 295.023 118.785 296.298 C 120.065 297.394,121.641 297.668,121.596 296.787 C 121.511 295.101,119.687 291.392,117.992 289.461 C 116.809 288.112,116.622 287.667,116.622 286.189 C 116.622 283.892,116.151 282.999,114.414 281.998 L 112.951 281.157 113.809 280.509 C 115.298 279.383,115.763 279.468,117.571 281.197 C 119.860 283.386,121.237 285.278,121.662 286.817 C 122.116 288.459,124.563 290.723,126.208 291.023 C 127.754 291.305,129.067 292.114,129.067 292.784 C 129.067 293.059,129.547 293.627,130.133 294.044 C 130.720 294.462,131.200 295.109,131.200 295.482 C 131.200 295.855,131.756 296.667,132.436 297.285 C 133.116 297.904,133.767 298.708,133.882 299.072 C 134.033 299.546,134.435 299.733,135.301 299.733 C 136.974 299.733,138.799 300.681,139.540 301.936 C 139.906 302.556,140.823 303.273,141.767 303.678 C 143.996 304.633,145.413 305.707,145.804 306.736 C 146.088 307.482,146.293 307.577,147.191 307.380 C 148.018 307.198,148.524 307.360,149.532 308.129 C 150.718 309.034,150.906 309.074,151.942 308.652 C 153.742 307.920,154.428 307.838,155.468 308.233 C 157.041 308.832,156.605 309.333,154.510 309.333 C 153.434 309.333,152.463 309.515,152.322 309.743 C 151.856 310.498,153.150 311.126,156.926 311.981 C 157.511 312.113,158.019 312.505,158.123 312.905 C 158.315 313.639,159.268 313.834,159.845 313.257 C 160.065 313.038,160.950 313.277,162.316 313.924 C 163.487 314.480,165.004 315.054,165.689 315.201 C 166.373 315.348,167.874 315.768,169.024 316.134 C 170.174 316.500,171.627 316.800,172.254 316.800 C 172.880 316.800,174.979 317.373,176.918 318.073 C 182.242 319.994,182.809 320.226,183.059 320.583 C 183.940 321.843,193.201 322.512,194.595 321.415 C 195.803 320.465,196.481 320.680,196.795 322.112 C 196.928 322.714,197.143 323.142,197.273 323.064 C 197.404 322.986,198.551 323.151,199.822 323.432 C 204.431 324.450,207.203 324.684,208.265 324.146 C 209.590 323.476,211.067 323.240,215.441 323.000 C 219.533 322.777,221.025 322.244,221.366 320.885 C 221.491 320.388,221.751 320.106,221.965 320.239 C 222.199 320.383,222.259 320.254,222.123 319.899 C 221.968 319.496,222.056 319.384,222.418 319.523 C 222.701 319.632,222.933 320.003,222.933 320.349 C 222.933 320.769,223.303 321.052,224.044 321.200 C 225.699 321.531,226.133 321.475,226.133 320.930 C 226.133 320.660,226.413 320.337,226.756 320.214 C 227.098 320.090,227.778 319.754,228.267 319.466 C 229.565 318.703,231.883 318.817,234.782 319.787 C 238.829 321.140,244.817 321.236,246.001 319.965 C 246.952 318.944,248.912 319.300,248.791 320.471 C 248.701 321.342,248.267 321.264,255.072 321.593 C 257.397 321.705,259.411 321.866,259.547 321.950 C 260.208 322.359,261.348 321.030,260.803 320.486 C 259.629 319.312,260.646 318.938,263.099 319.641 C 264.304 319.986,265.356 319.620,264.564 319.130 C 264.352 318.999,264.174 317.901,264.169 316.690 C 264.164 315.479,263.996 313.774,263.794 312.901 C 263.186 310.262,265.361 307.147,267.067 308.212 C 268.312 308.990,268.800 306.795,268.800 300.422 C 268.800 294.325,268.861 294.499,266.583 294.098 C 265.395 293.889,265.091 293.694,265.178 293.196 C 265.330 292.331,264.623 289.140,264.162 288.608 C 263.663 288.033,262.555 286.053,261.631 284.089 C 261.218 283.209,260.660 282.360,260.392 282.203 C 259.591 281.733,258.776 279.444,259.219 278.910 C 259.864 278.133,261.632 278.998,262.206 280.371 C 262.477 281.021,263.179 281.801,263.765 282.104 C 264.438 282.452,264.913 283.032,265.056 283.683 C 265.180 284.248,265.656 285.062,266.113 285.492 C 266.571 285.922,267.225 287.022,267.566 287.937 C 267.907 288.852,268.400 289.848,268.662 290.151 C 269.529 291.157,270.245 293.694,269.862 294.408 C 269.372 295.324,269.416 295.467,270.184 295.467 C 270.554 295.467,270.949 295.227,271.062 294.933 C 271.313 294.278,272.356 294.223,272.356 294.864 C 272.356 295.120,272.756 295.871,273.244 296.533 C 273.733 297.196,274.133 298.149,274.133 298.652 C 274.133 299.155,274.453 300.163,274.844 300.893 C 275.236 301.623,275.556 302.451,275.556 302.734 C 275.556 303.017,275.906 303.494,276.335 303.795 C 276.764 304.095,277.284 304.864,277.491 305.504 C 278.205 307.712,278.575 306.717,278.845 301.867 C 279.436 291.255,279.700 288.281,280.241 286.135 C 280.796 283.938,280.107 282.392,277.873 280.818 C 276.993 280.197,276.191 279.432,276.091 279.118 C 275.991 278.804,275.181 278.352,274.291 278.114 C 273.400 277.876,272.201 277.363,271.625 276.974 C 271.049 276.585,270.100 275.944,269.516 275.549 C 268.932 275.154,268.092 274.690,267.650 274.518 C 266.134 273.930,260.978 269.096,260.978 268.262 C 260.978 267.235,265.429 267.811,267.289 269.079 C 267.924 269.512,268.918 270.187,269.497 270.578 C 270.075 270.969,270.851 271.289,271.219 271.289 C 272.032 271.289,273.067 272.360,273.067 273.201 C 273.067 273.867,275.200 274.966,275.649 274.530 C 276.191 274.004,275.467 271.988,274.532 271.419 C 274.019 271.107,272.640 269.621,271.467 268.116 C 269.913 266.123,268.754 265.047,267.200 264.155 C 265.307 263.067,265.054 262.790,264.950 261.687 C 264.829 260.397,264.026 259.200,263.283 259.200 C 263.047 259.200,262.249 258.720,261.511 258.133 C 260.773 257.547,259.951 257.067,259.684 257.067 C 259.046 257.067,259.068 256.552,259.729 256.003 C 260.354 255.485,260.117 254.934,259.268 254.931 C 258.937 254.930,258.187 254.671,257.600 254.356 C 254.279 252.573,248.225 251.940,246.828 253.231 C 245.590 254.373,244.656 254.693,244.044 254.185 C 243.393 253.645,243.422 252.800,244.091 252.800 C 244.386 252.800,244.968 252.407,245.386 251.927 C 246.023 251.195,246.387 251.079,247.658 251.208 C 248.663 251.310,249.306 251.198,249.574 250.876 C 250.260 250.049,253.621 249.834,255.827 250.475 C 256.907 250.789,258.947 251.106,260.362 251.179 C 261.776 251.253,263.696 251.507,264.628 251.744 C 267.574 252.495,271.448 251.787,270.732 250.629 C 270.647 250.492,269.818 250.372,268.889 250.363 C 266.930 250.343,262.983 249.169,261.680 248.219 C 260.401 247.285,256.828 246.318,255.632 246.581 C 254.881 246.745,254.433 246.611,253.876 246.053 C 252.736 244.913,251.461 244.568,248.460 244.587 C 246.952 244.596,245.623 244.448,245.505 244.257 C 245.005 243.447,241.422 243.957,241.422 244.838 C 241.422 245.215,240.808 245.335,238.844 245.339 C 236.171 245.344,234.781 245.739,235.910 246.173 C 236.236 246.298,237.010 246.402,237.629 246.405 C 240.382 246.417,241.239 247.360,239.175 248.106 C 237.687 248.644,236.026 248.650,234.263 248.121 C 232.552 247.609,232.108 244.822,233.689 244.518 C 234.307 244.399,234.242 244.352,233.404 244.315 C 232.808 244.288,232.168 244.414,231.982 244.595 C 231.266 245.290,229.091 245.431,228.848 244.798 C 228.507 243.909,228.888 243.556,230.184 243.556 C 231.576 243.556,231.900 243.302,231.495 242.531 C 231.329 242.215,231.079 240.956,230.939 239.733 L 230.686 237.511 232.166 237.511 C 232.980 237.511,234.396 237.201,235.312 236.823 C 236.228 236.444,238.141 235.949,239.564 235.722 C 240.986 235.496,242.395 235.065,242.695 234.765 C 242.996 234.465,243.992 234.124,244.909 234.008 L 246.578 233.798 245.156 233.610 C 243.849 233.438,243.719 233.321,243.556 232.182 C 243.336 230.649,242.564 230.431,240.931 231.441 C 239.816 232.130,239.649 232.143,238.457 231.645 C 237.754 231.352,236.768 231.111,236.266 231.111 C 235.764 231.111,234.954 230.850,234.467 230.531 C 233.640 229.989,233.534 229.994,232.860 230.604 C 232.266 231.141,232.016 231.181,231.452 230.829 C 231.074 230.593,230.058 230.400,229.194 230.400 C 227.919 230.400,227.342 230.165,226.133 229.156 C 224.414 227.719,223.902 227.648,222.299 228.626 M152.178 231.822 C 152.178 232.217,152.415 232.533,152.711 232.533 C 153.310 232.533,153.334 232.468,153.029 231.674 C 152.724 230.879,152.178 230.974,152.178 231.822 M75.378 233.066 C 75.025 233.491,74.992 234.442,75.233 237.253 C 75.557 241.031,75.567 244.559,75.273 250.311 C 75.178 252.169,75.257 254.649,75.449 255.822 C 75.694 257.320,75.666 259.138,75.356 261.926 C 74.963 265.454,74.976 265.960,75.475 266.459 C 76.173 267.157,77.110 266.837,77.320 265.827 C 78.363 260.817,78.509 258.206,77.787 257.485 C 77.186 256.883,77.425 251.865,78.119 250.523 C 78.863 249.085,78.570 246.177,77.615 245.508 C 76.768 244.915,76.257 239.107,76.747 235.646 C 77.079 233.299,76.341 231.907,75.378 233.066 M146.016 233.298 C 145.784 234.186,146.304 235.022,147.088 235.022 C 147.452 235.022,147.568 234.688,147.489 233.870 C 147.355 232.484,146.333 232.087,146.016 233.298 M222.043 236.292 C 222.906 236.944,222.299 237.497,220.711 237.506 C 219.904 237.510,219.733 237.356,219.733 236.622 C 219.733 235.576,220.878 235.412,222.043 236.292 M21.063 238.739 C 21.494 239.042,22.297 239.289,22.846 239.289 C 23.476 239.289,23.926 239.519,24.065 239.911 C 24.187 240.253,24.512 240.797,24.788 241.120 C 25.065 241.443,25.156 241.791,24.991 241.892 C 24.624 242.119,19.783 240.035,19.607 239.574 C 19.538 239.392,19.088 239.094,18.608 238.911 C 18.128 238.728,17.827 238.431,17.939 238.249 C 18.225 237.785,20.126 238.084,21.063 238.739 M159.717 238.313 C 159.513 238.559,159.235 239.200,159.100 239.739 C 158.965 240.277,158.712 240.806,158.538 240.913 C 158.173 241.139,158.107 243.677,158.457 244.027 C 158.586 244.156,158.915 243.943,159.188 243.553 C 159.953 242.462,160.556 242.704,161.032 244.292 C 161.392 245.492,161.554 245.667,161.977 245.315 C 162.642 244.764,162.638 242.333,161.971 241.666 C 161.686 241.381,161.267 240.410,161.040 239.507 C 160.610 237.801,160.342 237.559,159.717 238.313 M206.965 239.078 C 206.188 239.904,206.184 239.940,206.853 240.152 C 207.747 240.436,208.711 240.061,208.711 239.429 C 208.711 239.156,208.871 238.933,209.067 238.933 C 209.262 238.933,209.422 238.773,209.422 238.578 C 209.422 237.893,207.761 238.230,206.965 239.078 M196.859 239.526 C 196.517 239.868,196.567 241.422,196.921 241.422 C 197.316 241.422,198.057 239.775,197.784 239.502 C 197.504 239.223,197.153 239.232,196.859 239.526 M217.956 239.644 C 217.956 239.840,217.716 240.000,217.422 240.000 C 217.129 240.000,216.889 239.840,216.889 239.644 C 216.889 239.449,217.129 239.289,217.422 239.289 C 217.716 239.289,217.956 239.449,217.956 239.644 M239.173 239.523 C 238.858 239.839,239.615 240.711,240.205 240.711 C 241.177 240.711,242.530 239.890,242.055 239.588 C 241.507 239.241,239.501 239.195,239.173 239.523 M226.569 240.473 C 227.310 241.638,226.310 242.489,224.201 242.489 C 222.717 242.489,222.601 242.022,223.738 240.618 C 224.561 239.601,225.969 239.529,226.569 240.473 M28.712 242.386 C 29.343 243.232,28.822 243.572,27.280 243.322 C 26.163 243.141,25.956 242.968,25.956 242.220 C 25.956 241.171,27.894 241.288,28.712 242.386 M221.175 242.408 C 223.251 243.466,222.461 244.823,219.590 245.130 C 218.398 245.258,216.782 245.667,216.000 246.038 C 209.320 249.213,208.000 249.549,208.000 248.071 C 208.000 247.098,208.616 246.400,209.473 246.400 C 209.814 246.400,210.302 246.120,210.558 245.778 C 211.559 244.436,212.115 244.229,213.732 244.592 C 214.920 244.859,215.400 244.828,215.816 244.455 C 216.113 244.189,216.936 243.864,217.646 243.732 C 218.492 243.575,219.093 243.198,219.395 242.635 C 219.647 242.164,219.873 241.778,219.896 241.778 C 219.919 241.778,220.495 242.061,221.175 242.408 M177.822 248.666 C 178.251 249.607,177.734 251.024,176.965 251.019 C 176.210 251.015,175.616 249.280,176.103 248.500 C 176.677 247.582,177.358 247.647,177.822 248.666 M245.267 249.333 C 245.359 249.815,245.143 249.956,244.314 249.956 C 243.107 249.956,242.501 249.329,243.243 248.847 C 243.992 248.362,245.134 248.636,245.267 249.333 M217.047 249.923 C 217.702 250.983,216.145 251.939,214.392 251.554 C 212.866 251.219,213.090 250.471,214.844 250.049 C 216.897 249.555,216.822 249.559,217.047 249.923 M103.083 250.286 C 103.512 250.558,103.496 250.747,102.972 251.547 C 102.260 252.632,101.097 252.630,101.261 251.543 C 101.509 249.905,101.974 249.584,103.083 250.286 M160.258 250.662 C 163.034 250.669,163.262 251.292,163.024 258.215 C 162.921 261.201,162.839 264.312,162.842 265.129 C 162.853 268.193,161.980 269.009,159.870 267.909 C 159.310 267.617,158.402 267.378,157.851 267.378 C 156.329 267.378,155.620 266.468,155.937 264.923 C 156.081 264.220,156.182 263.404,156.162 263.111 C 155.484 253.200,155.858 249.975,157.630 250.450 C 158.054 250.564,159.236 250.659,160.258 250.662 M242.489 250.714 C 242.489 251.346,241.037 252.444,240.202 252.444 C 239.787 252.444,239.085 252.698,238.643 253.008 C 237.779 253.613,240.800 255.573,243.517 256.169 C 244.098 256.297,244.757 256.623,244.982 256.894 C 245.206 257.164,245.937 257.566,246.606 257.787 C 247.275 258.008,247.822 258.331,247.822 258.506 C 247.822 258.680,248.569 259.041,249.481 259.307 C 251.440 259.878,252.403 261.333,250.822 261.333 C 249.668 261.333,247.777 260.536,247.156 259.788 C 246.540 259.045,245.899 259.041,245.162 259.778 C 244.629 260.311,244.524 260.300,243.803 259.644 C 242.709 258.649,241.616 258.133,240.598 258.133 C 240.060 258.133,239.503 257.792,239.144 257.244 C 238.305 255.964,235.651 255.986,233.660 257.289 C 231.820 258.494,232.038 259.008,235.596 261.867 C 239.053 264.645,240.067 267.074,238.445 268.696 C 238.166 268.975,240.166 271.787,241.070 272.388 C 241.892 272.933,242.263 275.193,241.571 275.438 C 240.814 275.707,239.289 274.121,239.289 273.065 C 239.289 272.354,239.071 271.979,238.564 271.818 C 237.625 271.520,235.022 268.813,235.022 268.134 C 235.022 267.277,233.910 266.311,232.923 266.310 C 231.813 266.308,230.371 265.460,227.238 262.969 C 224.239 260.584,222.049 259.357,220.311 259.088 C 219.554 258.971,218.669 258.635,218.346 258.342 C 217.662 257.723,214.331 256.797,211.644 256.479 C 209.070 256.174,209.013 255.188,211.535 254.583 C 213.481 254.116,214.556 254.314,215.689 255.350 C 216.809 256.374,220.015 256.347,220.857 255.307 C 221.655 254.322,222.647 254.148,224.559 254.660 C 225.910 255.021,226.190 254.992,226.815 254.426 C 227.535 253.775,231.612 253.526,233.218 254.036 C 233.699 254.189,234.060 253.927,234.577 253.051 C 235.675 251.190,242.489 249.177,242.489 250.714 M36.267 252.133 C 36.267 252.790,36.121 252.860,35.156 252.667 C 34.544 252.544,33.638 252.444,33.141 252.444 C 31.905 252.444,32.413 252.035,34.041 251.719 C 36.146 251.311,36.267 251.333,36.267 252.133 M65.957 252.150 C 66.418 252.610,65.541 253.834,64.387 254.343 C 62.523 255.166,62.256 255.102,61.666 253.689 C 61.168 252.497,61.067 252.443,59.284 252.419 C 57.937 252.401,57.619 252.312,58.133 252.096 C 58.824 251.807,65.661 251.854,65.957 252.150 M271.808 252.889 C 271.428 253.875,271.938 254.952,272.397 254.133 C 272.626 253.726,272.626 253.296,272.397 252.889 C 272.064 252.296,272.036 252.296,271.808 252.889 M220.940 253.362 C 221.450 254.693,220.752 254.906,218.198 254.197 C 217.076 253.885,216.914 253.731,217.264 253.310 C 217.863 252.588,220.658 252.628,220.940 253.362 M275.585 254.133 C 275.902 255.060,276.167 255.283,276.924 255.261 C 277.447 255.245,277.629 255.150,277.333 255.048 C 277.040 254.946,276.438 254.438,275.994 253.920 L 275.189 252.978 275.585 254.133 M154.247 255.116 C 153.869 255.494,152.546 255.597,152.340 255.264 C 152.060 254.810,153.684 254.209,154.110 254.609 C 154.292 254.781,154.354 255.009,154.247 255.116 M196.444 256.711 C 196.575 256.923,196.145 257.067,195.378 257.067 C 194.611 257.067,194.180 256.923,194.311 256.711 C 194.432 256.516,194.912 256.356,195.378 256.356 C 195.844 256.356,196.324 256.516,196.444 256.711 M61.511 258.311 C 61.511 258.637,61.683 258.846,61.893 258.776 C 62.104 258.706,62.276 258.497,62.276 258.311 C 62.276 258.125,62.104 257.916,61.893 257.846 C 61.683 257.776,61.511 257.985,61.511 258.311 M274.844 261.093 C 274.844 261.378,275.263 261.717,275.775 261.845 C 277.458 262.268,277.339 261.328,275.644 260.816 C 275.070 260.642,274.844 260.721,274.844 261.093 M246.604 263.025 C 246.243 263.386,245.589 262.493,245.876 262.030 C 246.072 261.713,246.233 261.759,246.482 262.203 C 246.668 262.536,246.723 262.906,246.604 263.025 M255.183 263.099 C 255.283 263.484,255.708 263.907,256.126 264.040 C 256.544 264.173,257.055 264.512,257.260 264.793 C 257.466 265.075,258.187 265.417,258.862 265.555 C 260.585 265.905,260.869 267.378,259.214 267.378 C 258.562 267.378,258.027 267.160,257.906 266.844 C 257.794 266.551,257.475 266.311,257.198 266.311 C 256.920 266.311,256.541 265.911,256.356 265.422 C 256.170 264.933,255.774 264.533,255.475 264.533 C 255.177 264.533,254.933 264.399,254.933 264.235 C 254.933 264.071,254.533 263.754,254.044 263.531 C 252.888 263.005,252.906 262.400,254.078 262.400 C 254.696 262.400,255.060 262.631,255.183 263.099 M249.193 264.603 C 249.262 264.786,249.718 265.086,250.205 265.272 C 250.692 265.457,251.171 265.916,251.269 266.291 C 251.368 266.666,251.672 267.059,251.946 267.164 C 252.220 267.269,252.444 267.606,252.444 267.912 C 252.444 268.364,252.306 268.395,251.716 268.080 C 250.928 267.658,247.467 264.319,247.467 263.981 C 247.467 263.659,249.051 264.231,249.193 264.603 M58.826 265.384 C 61.233 266.018,61.222 266.524,58.798 266.774 C 57.621 266.895,55.844 267.439,54.564 268.069 C 53.350 268.667,51.828 269.156,51.182 269.156 C 50.535 269.156,49.483 269.345,48.843 269.576 C 47.938 269.903,47.466 269.899,46.718 269.559 L 45.757 269.121 46.967 268.077 C 47.828 267.334,48.421 267.087,49.017 267.222 C 49.536 267.339,50.523 267.063,51.602 266.499 C 54.562 264.951,56.214 264.696,58.826 265.384 M69.956 265.689 C 69.781 266.212,68.803 266.457,68.046 266.166 C 67.204 265.843,67.842 265.244,69.028 265.244 C 69.731 265.244,70.052 265.399,69.956 265.689 M25.600 268.800 C 25.600 268.996,25.271 269.156,24.868 269.156 C 24.465 269.156,24.235 268.996,24.356 268.800 C 24.476 268.604,24.806 268.444,25.088 268.444 C 25.369 268.444,25.600 268.604,25.600 268.800 M254.565 269.488 C 255.077 270.443,255.027 270.821,254.355 271.079 C 253.568 271.381,252.800 270.673,252.800 269.645 C 252.800 268.587,254.024 268.477,254.565 269.488 M43.142 271.289 C 42.232 272.253,40.178 272.824,40.178 272.112 C 40.178 271.355,41.832 270.222,42.937 270.222 L 44.149 270.222 43.142 271.289 M246.578 270.578 C 246.699 270.773,246.468 270.933,246.065 270.933 C 245.663 270.933,245.333 270.773,245.333 270.578 C 245.333 270.382,245.564 270.222,245.846 270.222 C 246.127 270.222,246.457 270.382,246.578 270.578 M81.039 271.617 C 79.905 272.751,79.685 273.936,80.548 274.267 C 80.869 274.391,81.072 274.296,81.039 274.039 C 80.903 272.978,81.127 272.393,82.004 271.515 C 82.520 271.000,82.747 270.578,82.510 270.578 C 82.273 270.578,81.611 271.045,81.039 271.617 M68.013 271.218 C 66.318 271.316,65.997 271.484,64.263 273.177 C 62.776 274.628,61.946 275.134,60.427 275.517 C 58.323 276.048,55.992 277.319,52.292 279.955 C 51.409 280.584,49.746 281.235,47.963 281.650 C 43.920 282.592,43.617 282.809,45.256 283.590 C 46.751 284.303,46.878 284.614,45.887 285.145 C 45.401 285.405,44.934 285.395,44.313 285.112 C 42.197 284.148,40.670 285.723,42.703 286.774 C 43.751 287.316,43.846 287.307,44.613 286.586 C 45.232 286.005,45.463 285.941,45.606 286.311 C 45.708 286.577,46.456 287.014,47.268 287.282 C 48.937 287.833,49.384 288.394,49.146 289.639 C 48.917 290.836,48.580 290.948,47.083 290.322 C 44.957 289.434,43.568 289.611,42.234 290.942 C 39.837 293.333,38.264 293.922,37.319 292.783 C 36.755 292.103,35.578 292.240,35.073 293.046 C 34.788 293.501,34.844 293.810,35.304 294.318 C 36.414 295.545,35.519 299.210,33.842 300.308 C 32.330 301.298,31.495 302.579,31.105 304.504 C 30.758 306.221,30.688 306.302,29.309 306.575 C 27.432 306.946,24.853 311.598,26.121 312.325 C 29.215 314.099,30.678 317.706,28.674 318.619 C 27.281 319.254,26.982 322.340,28.238 323.116 C 29.985 324.196,31.049 331.926,29.785 334.356 C 29.548 334.811,29.564 335.102,29.834 335.269 C 30.058 335.407,30.273 336.769,30.330 338.404 C 30.446 341.801,30.694 341.625,25.745 341.664 C 23.967 341.678,21.777 341.827,20.878 341.995 C 19.980 342.163,18.474 342.229,17.533 342.143 C 16.592 342.056,15.422 342.143,14.933 342.336 C 14.329 342.574,16.488 342.626,21.689 342.500 C 29.105 342.320,96.357 342.340,162.311 342.541 C 180.107 342.596,195.067 342.515,195.556 342.363 C 196.315 342.126,196.238 342.083,195.022 342.067 C 194.240 342.057,192.640 341.911,191.467 341.743 C 190.293 341.575,189.013 341.552,188.622 341.693 C 188.231 341.833,186.791 341.803,185.422 341.626 C 184.053 341.449,179.653 341.386,175.644 341.486 C 164.760 341.757,157.259 341.208,161.841 340.476 C 162.658 340.345,164.729 339.764,166.442 339.186 C 168.156 338.607,169.806 338.133,170.108 338.133 C 170.411 338.133,170.956 337.879,171.319 337.568 C 172.479 336.574,176.119 335.294,177.956 335.234 C 179.333 335.188,179.453 335.145,178.489 335.043 C 177.804 334.971,176.204 334.689,174.933 334.418 C 173.662 334.146,171.423 333.911,169.958 333.895 C 165.230 333.844,164.147 333.386,164.223 331.469 C 164.297 329.595,164.421 328.889,164.674 328.889 C 164.815 328.889,165.028 328.579,165.148 328.201 C 165.268 327.822,165.639 327.457,165.972 327.390 C 166.305 327.323,164.578 327.062,162.133 326.810 C 159.403 326.528,157.356 326.136,156.826 325.793 C 155.444 324.899,154.339 323.541,154.549 322.994 C 154.662 322.700,154.526 322.489,154.223 322.489 C 152.945 322.489,151.751 320.763,152.002 319.279 C 152.195 318.137,152.135 317.867,151.688 317.867 C 151.384 317.867,150.645 317.387,150.044 316.800 C 149.257 316.030,148.611 315.733,147.722 315.733 C 146.814 315.733,146.129 315.406,145.113 314.489 C 144.356 313.804,143.488 313.244,143.184 313.244 C 142.881 313.244,142.149 312.838,141.558 312.341 C 140.968 311.844,139.756 311.189,138.865 310.885 C 137.882 310.550,136.949 309.917,136.490 309.273 C 135.925 308.479,135.539 308.261,134.958 308.407 C 134.186 308.600,130.740 305.731,129.863 304.164 C 129.563 303.630,129.352 303.599,128.349 303.949 C 126.149 304.716,125.849 304.296,126.610 301.511 C 126.818 300.751,125.344 300.967,124.489 301.822 C 123.631 302.680,120.923 302.478,119.178 301.425 C 116.113 299.577,113.519 300.304,115.363 302.496 C 116.314 303.626,116.588 305.797,115.911 306.844 C 115.634 307.274,115.565 307.219,115.561 306.561 C 115.558 306.111,115.191 305.391,114.745 304.961 C 114.299 304.530,113.737 303.725,113.496 303.172 C 112.450 300.777,111.723 302.966,111.626 308.800 C 111.594 310.756,111.465 313.314,111.339 314.486 L 111.111 316.617 109.956 314.102 C 109.320 312.719,108.800 311.443,108.800 311.266 C 108.800 310.170,106.841 307.200,106.119 307.200 C 104.913 307.200,104.496 306.395,104.428 303.937 C 104.341 300.821,104.803 296.121,105.239 295.686 C 105.875 295.050,105.628 294.701,104.622 294.818 C 104.084 294.880,103.564 295.014,103.467 295.115 C 103.369 295.217,102.276 295.823,101.039 296.462 C 98.554 297.745,98.170 298.013,96.641 299.533 C 95.001 301.164,94.028 299.034,95.071 296.097 C 95.405 295.157,95.586 294.238,95.474 294.056 C 95.161 293.550,96.505 292.978,98.021 292.972 C 98.767 292.969,99.594 292.830,99.859 292.662 C 100.179 292.459,99.940 292.367,99.148 292.387 C 94.879 292.494,94.610 292.404,92.484 290.158 C 90.263 287.811,87.744 286.164,85.333 285.480 C 84.453 285.231,83.309 284.736,82.790 284.380 C 82.270 284.024,81.470 283.732,81.012 283.731 C 77.886 283.724,77.114 282.875,78.259 280.706 C 78.984 279.332,78.985 279.312,78.290 280.041 C 77.896 280.454,77.014 281.138,76.330 281.561 C 75.261 282.221,75.052 282.578,74.843 284.098 C 74.612 285.777,74.393 286.034,73.313 285.888 C 73.057 285.854,72.593 286.475,72.281 287.269 C 71.969 288.062,71.579 288.711,71.413 288.711 C 71.247 288.711,71.111 288.896,71.111 289.122 C 71.111 289.911,67.310 293.156,66.386 293.156 C 64.970 293.156,65.824 288.456,67.310 288.071 C 68.315 287.811,68.479 287.587,68.750 286.110 C 68.958 284.971,69.363 284.183,70.028 283.624 C 71.530 282.360,70.960 281.244,68.811 281.244 C 67.265 281.244,67.200 281.287,67.200 282.290 C 67.200 282.865,67.038 283.436,66.839 283.559 C 66.641 283.681,66.158 284.411,65.765 285.180 C 65.373 285.949,64.840 286.578,64.581 286.578 C 63.923 286.578,63.108 287.603,62.627 289.035 C 62.403 289.702,61.780 290.821,61.243 291.521 C 60.088 293.027,59.022 295.277,59.022 296.207 C 59.022 296.577,58.573 297.103,58.008 297.395 C 56.810 298.014,56.009 299.141,55.671 300.680 C 55.536 301.293,54.960 302.411,54.390 303.164 C 53.820 303.917,53.349 304.699,53.343 304.902 C 53.338 305.105,52.860 305.825,52.281 306.502 C 51.702 307.179,51.222 307.919,51.214 308.146 C 51.207 308.373,50.680 308.975,50.044 309.483 C 49.409 309.991,48.729 310.584,48.533 310.800 C 48.338 311.017,47.658 311.724,47.022 312.373 C 46.071 313.343,45.867 313.830,45.867 315.121 C 45.867 316.238,45.662 316.875,45.156 317.333 C 44.764 317.687,44.450 318.232,44.457 318.544 C 44.481 319.639,42.510 323.169,41.867 323.185 C 41.155 323.202,41.103 322.907,41.591 321.623 C 41.806 321.059,42.212 320.711,42.658 320.711 C 43.305 320.711,43.378 320.483,43.378 318.445 C 43.378 317.198,43.621 315.489,43.918 314.647 C 44.583 312.763,44.214 312.267,42.721 313.039 C 41.936 313.444,41.519 314.003,41.248 315.010 C 41.040 315.782,40.728 316.502,40.555 316.609 C 40.381 316.716,40.130 317.451,39.997 318.242 C 39.863 319.033,39.468 319.953,39.118 320.285 C 38.769 320.617,38.369 321.420,38.230 322.068 C 37.968 323.294,37.176 323.896,36.594 323.314 C 36.116 322.836,36.898 320.779,37.726 320.336 C 38.244 320.058,38.400 319.579,38.400 318.262 C 38.400 316.927,38.596 316.336,39.289 315.589 C 39.778 315.062,40.178 314.358,40.179 314.026 C 40.181 313.315,41.724 310.178,42.487 309.336 C 42.778 309.014,43.177 307.903,43.374 306.866 C 43.594 305.704,44.275 304.168,45.151 302.856 C 47.016 300.063,47.552 298.289,46.996 296.752 C 46.170 294.466,47.190 292.780,48.858 293.673 C 49.845 294.201,50.489 293.930,50.489 292.986 C 50.489 291.709,50.931 291.204,52.392 290.811 C 53.301 290.567,54.292 289.937,54.976 289.170 C 55.904 288.128,56.198 287.986,56.780 288.297 C 57.318 288.585,57.713 288.512,58.516 287.977 C 59.088 287.597,60.076 286.950,60.711 286.541 C 61.347 286.131,61.867 285.572,61.867 285.298 C 61.867 284.986,62.250 284.800,62.892 284.800 C 63.932 284.800,65.067 283.622,65.067 282.543 C 65.067 281.817,63.839 281.601,62.794 282.143 C 62.301 282.399,61.587 282.527,61.206 282.427 C 60.826 282.328,59.759 282.581,58.835 282.990 C 57.910 283.399,56.932 283.733,56.661 283.733 C 56.390 283.733,55.859 283.926,55.482 284.162 C 54.916 284.515,54.666 284.474,54.064 283.929 C 53.003 282.968,53.144 282.739,54.961 282.466 C 55.856 282.332,56.739 282.042,56.923 281.822 C 57.107 281.602,57.535 281.085,57.873 280.673 C 58.212 280.261,58.889 279.810,59.378 279.671 C 59.867 279.532,60.747 279.208,61.333 278.953 C 64.018 277.782,65.116 277.542,68.380 277.418 L 71.871 277.285 73.122 278.612 C 74.434 280.003,75.004 279.879,75.017 278.200 C 75.023 277.365,73.165 275.825,71.822 275.553 C 70.538 275.293,70.454 273.954,71.644 272.712 C 73.004 271.292,72.232 270.975,68.013 271.218 M73.466 272.520 C 74.024 274.347,75.135 274.454,74.780 272.647 C 74.651 271.987,74.386 271.710,73.919 271.745 C 73.413 271.783,73.300 271.976,73.466 272.520 M249.980 272.756 C 250.472 273.675,249.896 274.189,248.533 274.048 C 247.856 273.978,247.618 273.722,247.532 272.978 C 247.384 271.693,249.317 271.518,249.980 272.756 M75.653 275.043 C 75.544 275.152,75.536 275.552,75.636 275.932 C 75.975 277.228,78.222 276.458,78.222 275.046 C 78.222 274.785,75.914 274.782,75.653 275.043 M276.235 276.000 C 276.422 276.920,276.666 277.178,277.435 277.268 C 278.622 277.406,278.660 276.940,277.559 275.752 C 276.407 274.509,275.950 274.594,276.235 276.000 M246.402 277.153 C 245.926 277.727,244.978 277.478,244.978 276.780 C 244.978 276.517,245.258 276.145,245.600 275.954 C 246.397 275.508,247.008 276.423,246.402 277.153 M108.852 280.444 C 109.665 282.306,109.518 282.381,110.609 279.556 C 111.048 278.419,111.526 278.564,111.992 279.974 C 112.406 281.231,111.942 282.659,111.114 282.673 C 110.917 282.676,111.375 283.036,112.132 283.473 C 113.826 284.450,115.446 287.097,114.815 287.857 C 114.241 288.549,114.061 288.503,112.499 287.262 L 111.123 286.168 110.327 287.166 C 109.457 288.258,109.004 288.089,108.619 286.529 C 108.444 285.820,108.584 285.409,109.196 284.839 L 110.004 284.086 108.528 283.506 C 106.888 282.862,106.038 280.475,107.025 279.286 C 107.730 278.436,108.068 278.650,108.852 280.444 M37.230 282.780 C 37.131 283.038,36.154 283.449,35.058 283.694 C 33.365 284.073,32.290 284.800,33.422 284.800 C 33.618 284.800,33.778 285.100,33.778 285.468 C 33.778 285.835,34.018 286.334,34.311 286.578 C 35.306 287.403,33.882 288.688,31.929 288.728 C 31.375 288.739,31.672 288.963,32.849 289.423 C 33.805 289.797,34.936 290.429,35.361 290.829 C 36.283 291.695,37.528 291.778,37.829 290.993 C 38.272 289.837,38.040 288.393,37.331 287.896 C 36.529 287.334,36.658 285.508,37.554 284.764 C 37.824 284.541,38.044 283.897,38.044 283.334 C 38.044 282.283,37.550 281.946,37.230 282.780 M91.022 290.828 C 91.022 292.311,89.551 292.688,88.946 291.361 C 88.429 290.226,88.423 290.295,89.109 289.609 C 89.782 288.935,91.022 289.726,91.022 290.828 M77.867 291.733 C 77.867 292.395,77.707 293.035,77.511 293.156 C 77.294 293.290,77.156 292.737,77.156 291.733 C 77.156 290.729,77.294 290.177,77.511 290.311 C 77.707 290.432,77.867 291.072,77.867 291.733 M82.483 292.115 C 82.492 293.772,81.406 299.770,80.879 300.978 C 80.442 301.980,80.412 301.877,80.385 299.289 C 80.358 296.790,80.420 296.533,81.045 296.533 C 81.660 296.533,81.731 296.278,81.712 294.133 C 81.677 290.338,81.732 289.868,82.133 290.489 C 82.323 290.782,82.480 291.514,82.483 292.115 M28.595 293.137 C 27.993 293.612,27.069 294.108,26.542 294.241 C 26.015 294.373,25.387 294.747,25.147 295.071 C 24.907 295.395,24.037 295.958,23.214 296.322 C 22.391 296.686,21.431 297.375,21.081 297.853 C 20.223 299.023,18.786 299.733,17.276 299.733 C 15.901 299.733,15.832 299.793,14.045 302.525 C 12.586 304.754,12.592 304.718,13.511 305.778 C 14.053 306.403,14.224 307.113,14.228 308.766 C 14.236 312.131,15.600 312.960,16.862 310.366 L 17.542 308.966 18.351 309.726 L 19.160 310.486 20.247 308.187 C 21.557 305.414,21.573 305.161,20.475 304.660 C 19.251 304.103,19.024 302.901,20.002 302.158 C 20.942 301.444,21.514 301.792,21.806 303.254 C 21.970 304.074,22.249 304.315,23.251 304.503 C 24.058 304.654,24.573 304.988,24.721 305.455 C 24.939 306.139,26.183 306.844,27.172 306.844 C 27.512 306.844,27.685 305.670,27.840 302.311 C 28.125 296.100,28.611 294.358,30.171 293.957 C 31.325 293.659,31.343 293.627,30.738 292.958 C 29.953 292.091,29.919 292.093,28.595 293.137 M134.908 294.715 C 135.016 294.889,134.879 295.216,134.606 295.444 C 134.051 295.904,133.484 295.375,133.867 294.756 C 134.139 294.315,134.649 294.296,134.908 294.715 M76.222 295.867 C 76.724 298.374,76.175 302.855,75.620 300.781 C 75.275 299.490,75.329 294.756,75.689 294.756 C 75.860 294.756,76.100 295.256,76.222 295.867 M271.742 297.889 C 271.312 298.161,271.123 298.999,271.233 300.140 C 271.322 301.072,272.228 301.184,272.626 300.312 C 273.079 299.318,272.405 297.470,271.742 297.889 M233.097 301.799 C 233.505 302.140,233.947 302.852,234.080 303.381 C 234.219 303.935,234.762 304.571,235.361 304.880 C 236.638 305.541,237.511 306.733,237.511 307.818 C 237.511 308.403,237.870 308.805,238.777 309.238 C 239.797 309.724,240.125 310.146,240.463 311.409 C 240.693 312.271,241.084 313.054,241.330 313.149 C 241.576 313.243,241.768 313.743,241.755 314.260 C 241.734 315.137,241.712 315.149,241.428 314.446 C 241.260 314.031,240.671 313.580,240.117 313.444 C 238.420 313.026,237.556 312.243,237.156 310.759 C 236.890 309.768,236.465 309.178,235.750 308.809 C 235.188 308.518,234.354 307.608,233.897 306.787 C 233.440 305.966,232.587 305.031,232.000 304.708 C 230.548 303.909,229.991 302.334,230.920 301.654 C 231.798 301.013,232.188 301.039,233.097 301.799 M269.546 303.378 C 269.176 304.375,269.417 305.067,270.138 305.067 C 270.440 305.067,271.297 305.707,272.041 306.489 C 273.598 308.125,274.724 308.336,275.047 307.050 C 275.424 305.549,275.078 304.930,273.544 304.363 C 272.734 304.064,271.763 303.540,271.385 303.198 C 270.462 302.363,269.903 302.417,269.546 303.378 M79.289 305.422 C 79.289 306.009,79.129 306.489,78.933 306.489 C 78.538 306.489,78.443 304.965,78.815 304.593 C 79.217 304.191,79.289 304.318,79.289 305.422 M159.264 305.867 C 159.194 307.110,158.705 307.723,158.477 306.853 C 158.356 306.389,158.338 305.878,158.438 305.716 C 158.718 305.263,159.292 305.368,159.264 305.867 M268.883 308.316 C 268.973 308.930,268.859 310.330,268.630 311.427 C 268.307 312.978,268.311 313.660,268.650 314.488 L 269.086 315.554 269.343 313.838 C 269.485 312.894,269.808 312.042,270.061 311.944 C 270.941 311.607,271.661 309.156,271.183 308.127 C 270.494 306.642,268.660 306.793,268.883 308.316 M160.711 308.784 C 160.711 309.615,158.815 311.467,157.965 311.467 C 157.339 311.467,157.156 311.266,157.156 310.578 C 157.156 309.800,157.310 309.689,158.393 309.689 C 159.416 309.689,159.670 309.535,159.853 308.802 C 160.077 307.911,160.711 307.897,160.711 308.784 M168.490 308.588 C 168.854 308.819,168.467 309.226,166.979 310.178 C 165.878 310.882,164.978 311.620,164.978 311.818 C 164.978 312.016,164.427 312.178,163.754 312.178 C 161.613 312.178,161.774 311.304,164.134 310.107 C 164.941 309.698,165.696 309.117,165.812 308.815 C 166.040 308.219,167.687 308.079,168.490 308.588 M23.537 311.200 C 23.650 313.162,24.253 313.669,25.023 312.450 C 25.322 311.976,25.256 311.543,24.739 310.583 C 23.795 308.830,23.412 309.026,23.537 311.200 M18.350 312.185 C 17.614 314.024,18.197 317.511,19.240 317.511 C 20.296 317.511,20.692 315.155,20.034 312.800 C 19.356 310.376,19.109 310.286,18.350 312.185 M273.334 312.720 C 273.239 313.213,273.301 313.703,273.470 313.807 C 273.639 313.912,273.778 313.508,273.778 312.910 C 273.778 311.590,273.567 311.500,273.334 312.720 M23.508 315.765 C 23.315 316.236,23.014 317.102,22.840 317.689 C 22.605 318.479,22.276 318.785,21.573 318.868 C 20.424 319.004,20.389 319.506,21.438 320.787 C 22.879 322.547,25.557 319.930,25.113 317.195 C 24.820 315.390,23.971 314.634,23.508 315.765 M252.934 318.496 C 252.418 319.314,251.378 319.502,251.378 318.777 C 251.378 317.587,252.197 316.755,252.787 317.346 C 253.193 317.752,253.228 318.028,252.934 318.496 M190.607 319.289 C 190.786 319.289,190.933 319.449,190.933 319.644 C 190.933 320.078,189.272 320.121,189.008 319.694 C 188.733 319.249,189.216 318.881,189.788 319.100 C 190.059 319.204,190.427 319.289,190.607 319.289 M178.008 323.398 C 179.261 324.650,181.329 324.558,180.435 323.289 C 180.014 322.693,179.518 322.489,178.485 322.489 L 177.099 322.489 178.008 323.398 M26.194 324.986 C 25.593 325.576,25.577 325.839,25.989 328.412 C 26.750 333.173,27.841 332.827,27.620 327.895 C 27.475 324.643,27.172 324.026,26.194 324.986 M-0.000 328.939 C -0.000 329.553,0.236 330.233,0.525 330.450 C 0.814 330.667,1.318 331.964,1.644 333.333 C 2.678 337.666,3.511 339.364,2.856 335.803 C 1.629 329.136,0.000 325.220,-0.000 328.939 M194.878 328.512 C 194.525 328.731,194.515 328.863,194.837 329.062 C 195.071 329.207,195.422 329.165,195.618 328.969 C 196.081 328.506,195.485 328.137,194.878 328.512 M220.818 334.900 C 220.498 335.498,220.082 335.644,218.698 335.644 C 217.607 335.644,216.815 335.838,216.537 336.174 C 216.081 336.723,216.045 336.692,217.776 337.233 C 218.713 337.525,222.355 336.670,223.774 335.825 C 225.269 334.935,225.204 334.860,222.520 334.385 C 221.427 334.192,221.153 334.275,220.818 334.900 M224.917 338.673 C 224.275 339.654,224.361 339.741,226.304 340.070 C 227.516 340.275,230.044 339.941,230.044 339.576 C 230.044 339.304,226.527 337.778,225.901 337.778 C 225.683 337.778,225.240 338.181,224.917 338.673 M213.166 339.183 C 213.038 339.391,213.169 339.651,213.459 339.762 C 214.230 340.058,216.000 339.791,216.000 339.378 C 216.000 338.889,213.456 338.714,213.166 339.183 M236.978 341.007 C 234.044 341.136,229.151 341.262,226.104 341.287 C 223.056 341.313,219.616 341.533,218.459 341.778 L 216.356 342.222 219.378 342.415 C 221.040 342.520,229.680 342.553,238.578 342.486 C 247.476 342.419,255.356 342.373,256.089 342.383 C 258.450 342.413,257.511 341.795,254.311 341.212 C 251.074 340.621,246.901 340.572,236.978 341.007 M200.267 341.578 C 200.609 341.668,201.169 341.668,201.511 341.578 C 201.853 341.489,201.573 341.416,200.889 341.416 C 200.204 341.416,199.924 341.489,200.267 341.578 ");
				attr(path2, "stroke", "none");
				attr(path2, "fill", "#cd833b");
				attr(path2, "fill-rule", "evenodd");
				add_location(path2, file$7, 9, 140816, 140991);
				attr(path3, "id", "path3");
				attr(path3, "d", "M0.000 92.267 C 0.000 188.556,-0.012 187.758,1.380 183.111 C 1.615 182.329,1.954 181.689,2.134 181.689 C 2.314 181.689,2.629 181.068,2.833 180.308 C 3.038 179.549,3.444 178.729,3.736 178.487 C 4.028 178.244,4.267 177.863,4.267 177.640 C 4.267 176.915,5.746 174.435,7.048 172.978 C 8.176 171.716,9.043 171.012,10.994 169.778 C 11.303 169.582,12.452 168.822,13.548 168.089 C 14.644 167.356,15.651 166.756,15.785 166.756 C 15.920 166.756,16.873 166.133,17.902 165.373 C 18.932 164.612,20.085 163.930,20.465 163.858 C 21.450 163.670,21.496 162.466,20.597 160.377 C 19.637 158.145,19.807 155.905,21.006 155.001 C 21.830 154.380,26.099 152.876,27.022 152.882 C 29.317 152.897,33.698 149.697,35.153 146.942 C 35.661 145.980,35.123 142.015,34.258 140.342 C 33.632 139.131,33.738 135.575,34.413 135.158 C 34.629 135.025,34.966 134.199,35.163 133.324 C 36.140 128.973,37.097 128.275,39.846 129.913 C 42.651 131.584,43.011 131.549,45.816 129.341 C 51.290 125.032,53.034 123.344,54.095 121.325 C 55.802 118.080,60.198 113.197,63.176 111.236 C 66.001 109.377,67.549 108.444,67.815 108.444 C 67.965 108.443,69.004 107.891,70.122 107.217 C 71.240 106.543,72.840 105.795,73.677 105.556 C 74.515 105.316,75.360 105.002,75.556 104.859 C 76.554 104.126,83.782 102.671,87.716 102.411 C 91.565 102.156,94.412 101.367,94.590 100.504 C 94.597 100.471,94.834 99.244,95.117 97.778 C 95.399 96.311,96.051 92.951,96.564 90.311 C 97.875 83.564,97.659 81.877,95.311 80.490 C 94.003 79.717,92.278 76.487,91.932 74.163 C 91.789 73.201,91.455 72.081,91.189 71.674 C 90.669 70.877,89.486 63.761,89.792 63.267 C 89.893 63.102,89.723 60.787,89.415 58.122 C 88.864 53.371,88.867 53.247,89.582 51.770 C 89.983 50.942,90.311 50.105,90.311 49.910 C 90.311 49.376,92.064 47.855,93.878 46.815 C 96.941 45.057,97.477 44.199,97.818 40.501 C 98.008 38.439,98.320 37.005,98.660 36.630 C 98.957 36.301,99.200 35.639,99.200 35.158 C 99.200 34.677,99.503 33.690,99.872 32.965 C 100.242 32.240,100.655 31.206,100.789 30.668 C 100.923 30.129,101.234 29.449,101.480 29.156 C 101.726 28.862,102.140 28.062,102.400 27.378 C 102.660 26.693,103.071 25.893,103.314 25.600 C 103.556 25.307,104.276 24.027,104.914 22.756 C 105.552 21.484,106.168 20.364,106.283 20.267 C 106.640 19.964,108.444 17.480,108.444 17.292 C 108.444 17.059,110.688 13.386,110.971 13.156 C 111.091 13.058,111.456 12.458,111.782 11.822 C 112.107 11.187,112.500 10.667,112.654 10.667 C 112.809 10.667,113.193 10.125,113.509 9.464 C 114.246 7.917,116.200 5.689,116.819 5.689 C 117.083 5.689,117.426 5.461,117.582 5.183 C 117.973 4.487,121.850 2.489,122.809 2.489 C 123.239 2.489,123.762 2.318,123.972 2.108 C 124.181 1.899,125.122 1.531,126.063 1.291 C 131.022 0.026,129.761 0.000,64.030 0.000 L 0.000 0.000 0.000 92.267 M166.400 0.312 C 166.400 0.484,166.920 0.817,167.556 1.053 C 168.191 1.288,168.951 1.621,169.244 1.791 C 169.538 1.962,170.585 2.571,171.571 3.146 C 172.665 3.782,177.172 8.002,183.126 13.963 C 188.496 19.339,193.683 24.417,194.653 25.248 C 195.623 26.079,196.595 27.098,196.812 27.513 C 197.029 27.927,197.383 28.587,197.597 28.978 C 198.919 31.387,199.538 33.039,199.717 34.634 C 199.828 35.630,200.089 36.659,200.296 36.920 C 200.639 37.354,201.291 38.963,202.263 41.778 C 203.655 45.808,204.219 48.163,204.349 50.489 C 204.431 51.956,204.827 54.516,205.229 56.178 C 206.761 62.505,205.510 69.108,202.232 72.000 C 201.567 72.587,200.873 73.319,200.689 73.627 C 200.506 73.936,199.036 75.189,197.422 76.412 C 195.809 77.635,194.489 78.786,194.489 78.970 C 194.489 79.154,194.049 79.494,193.511 79.727 C 192.973 79.960,192.081 80.516,191.528 80.964 C 190.975 81.412,190.215 81.778,189.839 81.778 C 189.463 81.778,189.156 81.923,189.156 82.101 C 189.156 82.278,188.690 82.718,188.122 83.078 C 184.398 85.437,183.108 86.555,181.996 88.387 C 181.338 89.472,180.269 90.949,179.620 91.669 C 178.971 92.389,177.905 94.065,177.250 95.394 C 176.596 96.723,175.906 98.003,175.718 98.239 C 175.530 98.474,175.267 99.067,175.133 99.556 C 174.903 100.396,173.631 103.293,172.634 105.244 C 172.385 105.733,171.980 106.773,171.736 107.556 C 170.457 111.644,167.184 116.465,162.224 121.565 C 159.438 124.429,159.609 125.156,163.200 125.703 C 165.360 126.032,166.170 126.594,170.862 131.022 C 173.039 133.077,176.335 135.707,177.923 136.657 C 178.528 137.019,179.342 137.613,179.733 137.978 C 181.340 139.477,185.244 142.578,185.524 142.578 C 185.690 142.578,186.775 143.466,187.935 144.553 C 189.095 145.639,190.764 147.114,191.644 147.830 C 192.524 148.546,193.780 149.657,194.436 150.299 C 195.755 151.593,197.220 151.817,198.756 150.960 C 205.451 147.224,212.234 145.775,214.296 147.640 C 214.672 147.980,215.529 148.448,216.201 148.681 C 216.873 148.914,218.197 149.647,219.143 150.311 C 220.090 150.974,222.490 152.356,224.477 153.382 C 230.263 156.369,234.567 159.066,236.000 160.602 C 237.487 162.195,237.290 162.734,232.657 169.789 C 231.454 171.621,230.193 173.648,229.855 174.293 C 229.517 174.939,228.935 176.027,228.560 176.711 C 224.736 183.707,224.513 184.510,225.806 186.630 C 226.802 188.265,228.220 192.271,228.484 194.200 C 228.677 195.608,228.862 195.862,230.218 196.581 C 231.053 197.024,232.570 198.252,233.589 199.311 C 234.795 200.563,235.942 201.385,236.872 201.663 C 238.379 202.115,240.017 203.983,241.802 207.289 C 242.278 208.169,243.263 209.689,243.991 210.667 C 244.720 211.644,245.724 213.004,246.222 213.689 C 246.720 214.373,247.731 215.733,248.468 216.711 C 250.160 218.955,251.377 221.301,251.379 222.322 C 251.380 222.756,251.670 223.591,252.023 224.178 C 252.376 224.764,252.938 225.934,253.271 226.776 C 253.605 227.619,254.037 228.499,254.232 228.732 C 254.426 228.965,254.902 229.579,255.290 230.097 C 255.677 230.615,256.901 231.640,258.009 232.376 C 260.202 233.831,261.451 235.021,264.711 238.764 C 267.244 241.672,269.887 244.636,271.628 246.520 C 272.322 247.271,273.031 248.151,273.205 248.476 C 273.644 249.298,275.301 250.860,278.222 253.207 C 284.827 258.513,284.892 258.628,284.650 264.531 C 284.526 267.538,284.646 270.698,284.995 273.674 C 285.931 281.642,285.806 291.450,284.719 295.289 C 284.221 297.049,283.717 299.148,283.599 299.953 C 283.481 300.758,283.144 301.878,282.850 302.442 C 282.556 303.005,282.315 303.789,282.313 304.183 C 282.312 304.577,281.991 305.496,281.600 306.226 C 281.209 306.956,280.888 307.834,280.888 308.176 C 280.887 308.519,280.594 309.280,280.237 309.867 C 279.879 310.453,279.468 311.413,279.322 312.000 C 279.176 312.587,278.844 313.547,278.585 314.133 C 278.325 314.720,277.698 316.139,277.190 317.287 C 276.682 318.435,276.267 319.574,276.267 319.817 C 276.267 320.061,275.947 320.666,275.556 321.164 C 275.164 321.661,274.844 322.301,274.844 322.586 C 274.844 322.871,274.546 323.486,274.182 323.952 C 273.818 324.418,273.397 325.200,273.246 325.689 C 272.903 326.805,269.531 331.733,269.111 331.733 C 268.940 331.733,268.800 331.943,268.800 332.200 C 268.800 332.456,268.489 333.000,268.109 333.408 C 267.729 333.816,267.172 334.686,266.871 335.342 C 265.818 337.637,263.577 341.227,262.403 342.498 L 261.492 343.485 132.460 343.473 C 14.548 343.462,3.373 343.412,2.798 342.891 C 2.138 342.294,1.605 340.134,1.231 336.533 C 0.956 333.900,0.758 333.156,0.332 333.156 C 0.134 333.156,0.000 337.665,0.000 344.356 L 0.000 355.556 200.000 355.556 L 400.000 355.556 400.000 177.778 L 400.000 0.000 283.200 0.000 C 216.322 0.000,166.400 0.134,166.400 0.312 M228.706 85.116 C 229.333 86.065,229.013 112.981,228.367 113.627 C 227.647 114.347,204.719 114.092,203.830 113.355 C 203.478 113.063,203.378 109.936,203.378 99.318 L 203.378 85.657 204.251 84.784 C 205.463 83.571,206.371 83.688,207.529 85.206 L 208.516 86.500 208.624 95.961 C 208.763 108.129,208.669 107.591,210.731 108.031 C 213.364 108.592,214.274 107.462,213.914 104.080 C 213.805 103.058,213.710 101.982,213.704 101.689 C 213.370 86.199,213.511 84.971,215.708 84.246 C 216.937 83.840,217.010 83.868,218.198 85.203 L 219.422 86.578 219.133 90.133 C 218.669 95.846,218.864 105.487,219.478 107.151 C 219.830 108.108,219.947 108.157,221.460 107.987 C 224.107 107.688,224.079 107.825,223.794 96.834 C 223.524 86.425,223.631 85.705,225.702 84.015 C 226.255 83.564,228.134 84.253,228.706 85.116 M381.766 84.920 C 382.590 85.344,383.430 86.000,383.632 86.377 C 383.834 86.754,384.319 87.165,384.711 87.289 C 385.102 87.413,385.422 87.744,385.422 88.024 C 385.422 88.304,385.550 88.533,385.706 88.533 C 386.110 88.533,386.842 90.701,386.856 91.936 C 386.862 92.509,387.096 93.280,387.375 93.649 C 387.816 94.231,387.814 94.418,387.364 95.061 C 387.078 95.469,386.844 96.207,386.843 96.701 C 386.841 98.345,385.620 99.888,380.970 104.121 C 378.385 106.475,377.114 106.820,375.613 105.574 C 374.384 104.554,375.577 100.401,377.324 99.618 C 377.931 99.346,380.864 96.366,381.600 95.274 L 382.403 94.082 381.690 92.584 C 380.622 90.339,376.775 89.663,376.035 91.592 C 375.741 92.358,373.460 92.215,372.622 91.378 C 371.091 89.846,372.752 85.333,374.848 85.333 C 375.102 85.333,375.854 84.960,376.519 84.504 C 377.923 83.542,379.299 83.651,381.766 84.920 M345.423 92.802 C 345.544 92.996,347.136 93.156,348.962 93.156 L 352.282 93.156 353.297 94.374 C 354.878 96.274,355.788 97.913,356.098 99.418 L 356.383 100.800 356.634 99.407 C 356.772 98.641,357.146 97.823,357.465 97.590 C 357.784 97.357,358.044 96.891,358.044 96.555 C 358.044 96.219,358.698 95.317,359.496 94.550 L 360.947 93.156 364.118 93.156 C 366.815 93.156,367.395 93.262,368.000 93.867 C 368.391 94.258,368.849 94.578,369.018 94.578 C 369.585 94.578,371.277 97.364,371.003 97.846 C 369.792 99.975,367.673 100.545,365.964 99.200 C 364.753 98.248,364.105 98.303,362.846 99.467 L 361.789 100.444 363.862 100.629 C 368.088 101.006,368.279 105.557,364.092 106.133 C 362.063 106.412,361.969 106.577,363.188 107.722 C 363.980 108.466,364.280 108.523,366.306 108.315 C 370.976 107.837,372.661 113.149,368.080 113.906 C 362.185 114.881,357.685 112.895,356.733 108.898 L 356.413 107.556 355.807 108.711 C 355.473 109.347,354.966 110.311,354.680 110.854 C 353.523 113.052,352.235 113.856,349.562 114.047 C 346.631 114.257,346.679 114.177,346.672 118.914 C 346.665 122.996,344.735 125.512,343.111 123.556 C 342.868 123.262,342.467 123.022,342.220 123.022 C 341.429 123.022,341.343 121.652,341.338 109.029 L 341.333 96.636 340.267 97.778 C 339.640 98.449,339.199 99.307,339.199 99.860 C 339.198 100.377,338.897 101.293,338.529 101.896 C 338.161 102.499,337.752 103.484,337.621 104.084 C 337.489 104.684,337.070 105.784,336.690 106.529 C 336.311 107.274,335.999 108.210,335.998 108.609 C 335.996 109.007,335.677 109.813,335.289 110.400 C 334.900 110.987,334.581 111.713,334.580 112.014 C 334.579 112.315,334.276 113.153,333.907 113.877 C 333.538 114.600,333.124 115.788,332.988 116.517 C 332.851 117.246,332.517 118.271,332.246 118.795 C 331.975 119.319,331.651 120.392,331.525 121.180 C 331.349 122.277,331.003 122.820,330.042 123.503 L 328.789 124.395 327.584 123.442 C 325.971 122.167,325.583 118.044,327.076 118.044 C 327.237 118.044,327.476 117.131,327.607 116.015 C 327.738 114.899,328.099 113.705,328.410 113.363 C 329.230 112.456,329.254 109.117,328.445 108.306 C 328.103 107.964,327.734 107.255,327.624 106.731 C 327.514 106.207,327.273 105.538,327.089 105.244 C 326.905 104.951,326.595 104.342,326.400 103.890 C 326.205 103.439,325.646 102.194,325.156 101.124 C 324.667 100.054,324.267 99.024,324.267 98.834 C 324.267 98.644,323.149 98.489,321.778 98.489 L 319.289 98.489 319.289 105.600 C 319.289 113.626,319.133 114.133,316.662 114.133 C 314.093 114.133,313.968 113.758,313.867 105.778 L 313.778 98.667 312.000 98.483 C 309.354 98.208,308.398 96.279,309.701 93.843 C 310.104 93.091,322.398 92.771,323.524 93.484 C 323.828 93.677,324.260 93.655,324.623 93.428 C 325.814 92.684,327.664 93.399,328.306 94.851 C 328.628 95.581,329.109 96.578,329.375 97.067 C 330.154 98.498,331.304 101.087,331.566 101.997 C 331.864 103.035,333.315 100.768,333.836 98.450 C 334.003 97.707,334.398 96.840,334.714 96.524 C 335.030 96.208,335.289 95.671,335.289 95.331 C 335.289 92.985,338.538 92.430,340.220 94.489 L 341.309 95.822 341.321 94.858 C 341.328 94.328,341.533 93.725,341.778 93.519 C 343.756 91.844,343.920 91.761,344.556 92.101 C 344.913 92.292,345.303 92.607,345.423 92.802 M243.977 93.628 C 244.237 93.888,244.914 94.328,245.481 94.606 C 246.608 95.158,246.679 95.268,247.781 98.140 C 248.660 100.434,248.805 104.337,248.050 105.432 C 247.785 105.818,247.461 106.713,247.332 107.421 C 247.202 108.129,246.779 109.074,246.392 109.520 C 246.005 109.966,245.689 110.453,245.689 110.602 C 245.689 112.714,240.678 114.661,236.728 114.085 C 234.971 113.829,231.111 110.657,231.111 109.469 C 231.111 109.183,230.868 108.016,230.571 106.875 C 230.179 105.369,230.136 104.673,230.416 104.336 C 230.628 104.080,230.894 102.940,231.007 101.802 C 231.121 100.664,231.510 99.309,231.873 98.790 C 232.236 98.270,232.533 97.664,232.533 97.442 C 232.533 97.023,234.641 94.860,236.104 93.778 C 237.177 92.984,243.218 92.869,243.977 93.628 M271.574 94.253 C 272.395 94.857,273.067 95.490,273.067 95.661 C 273.067 95.832,273.427 96.308,273.867 96.718 C 274.903 97.683,275.011 100.878,274.044 101.946 C 273.269 102.803,273.254 103.443,273.998 103.987 C 274.500 104.354,275.132 105.702,275.801 107.834 C 275.911 108.183,275.762 108.743,275.470 109.078 C 275.179 109.414,274.838 110.117,274.714 110.640 C 274.275 112.490,271.086 113.793,266.404 114.033 L 262.408 114.239 261.848 112.899 C 261.394 111.812,261.292 110.095,261.311 103.801 C 261.343 93.102,261.317 93.156,266.462 93.156 C 269.948 93.156,270.138 93.196,271.574 94.253 M281.256 94.779 C 281.910 96.130,282.003 96.751,281.808 98.470 C 281.526 100.960,281.715 101.095,285.021 100.756 L 287.289 100.524 287.309 98.173 C 287.341 94.431,287.855 93.357,289.678 93.225 C 291.134 93.119,291.198 93.161,291.887 94.647 C 292.604 96.193,292.802 100.916,292.177 101.542 C 291.609 102.109,291.953 102.366,292.777 101.990 C 293.393 101.709,293.708 101.204,293.873 100.231 C 294.000 99.480,294.410 98.475,294.785 97.999 C 295.160 97.522,295.467 97.025,295.467 96.894 C 295.467 96.547,297.492 94.578,297.849 94.578 C 298.016 94.578,298.427 94.258,298.762 93.867 C 299.756 92.706,304.499 92.835,306.153 94.068 C 306.827 94.571,307.610 95.115,307.894 95.278 C 308.318 95.522,308.394 96.615,308.323 101.388 C 308.273 104.723,308.406 107.958,308.634 108.978 C 309.464 112.690,309.461 112.937,308.577 113.556 C 307.709 114.164,306.084 114.273,304.889 113.804 C 304.498 113.651,303.698 113.666,303.111 113.837 C 298.398 115.215,294.405 112.954,293.804 108.567 C 293.530 106.571,292.626 107.274,292.617 109.490 C 292.612 110.707,292.037 112.761,291.443 113.689 C 291.051 114.300,288.540 114.250,288.018 113.621 C 287.784 113.340,287.514 111.780,287.418 110.155 C 287.071 104.275,282.180 104.953,281.204 111.015 C 280.486 115.472,276.298 115.446,276.536 110.987 C 276.611 109.574,276.692 104.531,276.676 102.222 C 276.625 94.605,277.011 93.156,279.092 93.156 C 280.376 93.156,280.523 93.266,281.256 94.779 M238.844 98.734 C 238.502 98.823,238.222 99.039,238.222 99.212 C 238.222 99.386,237.885 99.842,237.473 100.226 C 236.523 101.111,235.749 104.634,236.159 106.206 C 236.975 109.333,241.320 109.042,241.924 105.820 C 242.050 105.152,242.388 104.409,242.676 104.170 C 245.042 102.207,242.011 97.907,238.844 98.734 M266.904 98.726 C 266.116 99.514,266.693 100.665,267.822 100.556 C 269.477 100.396,269.800 98.489,268.172 98.489 C 267.605 98.489,267.034 98.596,266.904 98.726 M300.891 99.472 C 300.062 100.007,299.382 100.692,299.380 100.996 C 299.379 101.299,299.237 101.699,299.065 101.884 C 296.581 104.568,299.216 109.698,302.246 108.076 C 302.953 107.698,303.358 98.480,302.667 98.495 C 302.520 98.498,301.721 98.938,300.891 99.472 M347.798 99.602 L 346.643 100.634 346.744 104.450 L 346.844 108.267 348.134 108.374 C 350.381 108.562,351.344 106.097,350.782 101.597 C 350.402 98.558,349.580 98.009,347.798 99.602 M267.139 106.234 C 265.128 107.501,266.826 109.738,269.046 108.746 L 270.536 108.080 269.757 107.245 C 268.862 106.286,267.743 105.854,267.139 106.234 M378.868 108.356 C 379.955 110.914,379.017 114.133,377.185 114.133 C 375.068 114.133,373.604 112.845,373.878 111.224 C 374.533 107.346,377.673 105.541,378.868 108.356 M256.395 111.200 C 257.532 114.143,254.738 120.178,252.239 120.178 C 250.901 120.178,250.516 115.228,251.733 113.681 C 252.124 113.184,252.444 112.558,252.444 112.290 C 252.444 110.248,255.683 109.355,256.395 111.200 ");
				attr(path3, "stroke", "none");
				attr(path3, "fill", "#fbfbfb");
				attr(path3, "fill-rule", "evenodd");
				add_location(path3, file$7, 9, 228638, 228813);
				attr(path4, "id", "path4");
				attr(path4, "d", "M127.885 0.498 C 127.780 0.772,127.058 1.103,126.280 1.235 C 125.502 1.366,124.571 1.697,124.211 1.970 C 123.850 2.243,123.212 2.471,122.792 2.478 C 121.835 2.492,117.965 4.502,117.582 5.183 C 117.426 5.461,117.083 5.689,116.819 5.689 C 116.200 5.689,114.246 7.917,113.509 9.464 C 113.193 10.125,112.809 10.667,112.654 10.667 C 112.500 10.667,112.107 11.187,111.782 11.822 C 111.456 12.458,111.091 13.058,110.971 13.156 C 110.688 13.386,108.444 17.059,108.444 17.292 C 108.444 17.480,106.640 19.964,106.283 20.267 C 106.168 20.364,105.552 21.484,104.914 22.756 C 104.276 24.027,103.556 25.307,103.314 25.600 C 103.071 25.893,102.660 26.693,102.400 27.378 C 102.140 28.062,101.726 28.862,101.480 29.156 C 101.234 29.449,100.923 30.129,100.789 30.668 C 100.655 31.206,100.242 32.240,99.872 32.965 C 99.503 33.690,99.200 34.677,99.200 35.158 C 99.200 35.639,98.957 36.301,98.660 36.630 C 98.320 37.005,98.008 38.439,97.818 40.501 C 97.477 44.199,96.941 45.057,93.878 46.815 C 92.064 47.855,90.311 49.376,90.311 49.910 C 90.311 50.105,89.983 50.942,89.582 51.770 C 88.867 53.247,88.864 53.371,89.415 58.122 C 89.723 60.787,89.893 63.102,89.792 63.267 C 89.486 63.761,90.669 70.877,91.189 71.674 C 91.455 72.081,91.789 73.201,91.932 74.163 C 92.278 76.487,94.003 79.717,95.311 80.490 C 97.659 81.877,97.875 83.564,96.564 90.311 C 96.051 92.951,95.399 96.311,95.117 97.778 C 94.834 99.244,94.597 100.471,94.590 100.504 C 94.412 101.367,91.565 102.156,87.716 102.411 C 83.782 102.671,76.554 104.126,75.556 104.859 C 75.360 105.002,74.515 105.316,73.677 105.556 C 72.840 105.795,71.240 106.543,70.122 107.217 C 69.004 107.891,67.965 108.443,67.815 108.444 C 67.549 108.444,66.001 109.377,63.176 111.236 C 60.198 113.197,55.802 118.080,54.095 121.325 C 53.034 123.344,51.290 125.032,45.816 129.341 C 43.011 131.549,42.651 131.584,39.846 129.913 C 37.097 128.275,36.140 128.973,35.163 133.324 C 34.966 134.199,34.629 135.025,34.413 135.158 C 33.738 135.575,33.632 139.131,34.258 140.342 C 35.123 142.015,35.661 145.980,35.153 146.942 C 33.698 149.697,29.317 152.897,27.022 152.882 C 26.099 152.876,21.830 154.380,21.006 155.001 C 19.807 155.905,19.637 158.145,20.597 160.377 C 21.496 162.466,21.450 163.670,20.465 163.858 C 20.085 163.930,18.932 164.612,17.902 165.373 C 16.873 166.133,15.920 166.756,15.785 166.756 C 15.651 166.756,14.644 167.356,13.548 168.089 C 12.452 168.822,11.303 169.582,10.994 169.778 C 9.043 171.012,8.176 171.716,7.048 172.978 C 5.746 174.435,4.267 176.915,4.267 177.640 C 4.267 177.863,4.028 178.244,3.736 178.487 C 3.444 178.729,3.038 179.549,2.833 180.308 C 2.629 181.068,2.314 181.689,2.134 181.689 C 1.954 181.689,1.615 182.329,1.380 183.111 C 1.146 183.893,0.739 184.533,0.477 184.533 C 0.158 184.533,0.000 185.003,0.000 185.956 C 0.000 188.328,1.576 187.143,2.010 184.444 C 2.133 183.677,2.426 183.111,2.698 183.111 C 2.959 183.111,3.343 182.478,3.552 181.704 C 3.760 180.930,4.074 180.208,4.249 180.100 C 4.424 179.992,5.085 178.825,5.718 177.507 C 6.351 176.189,7.150 174.837,7.493 174.503 C 7.837 174.169,8.331 173.599,8.592 173.238 C 8.853 172.876,9.988 172.057,11.115 171.418 C 12.242 170.778,13.922 169.666,14.848 168.948 C 17.453 166.928,19.287 165.792,20.332 165.551 C 21.915 165.187,22.982 163.353,22.401 161.995 C 21.003 158.723,21.776 155.412,23.945 155.386 C 24.306 155.381,25.031 155.072,25.557 154.697 C 26.083 154.323,27.147 153.900,27.923 153.758 C 31.410 153.118,34.318 151.046,36.230 147.838 C 37.080 146.414,37.092 146.597,35.776 140.879 C 35.130 138.070,35.499 136.358,36.821 136.026 C 37.630 135.824,37.664 135.747,37.170 135.253 C 36.869 134.951,36.625 134.676,36.628 134.641 C 36.631 134.606,36.854 133.858,37.125 132.978 C 37.664 131.223,37.704 131.214,40.262 132.287 C 42.670 133.297,45.654 132.069,49.052 128.672 C 49.616 128.107,50.231 127.644,50.416 127.644 C 51.070 127.644,55.655 122.459,56.533 120.726 C 58.356 117.132,65.185 111.272,70.816 108.469 C 72.054 107.853,73.467 107.124,73.956 106.850 C 75.201 106.150,80.541 104.635,82.652 104.382 C 83.622 104.266,84.574 104.012,84.768 103.819 C 84.962 103.625,86.579 103.467,88.362 103.467 C 91.758 103.467,95.191 102.714,95.503 101.900 C 95.610 101.621,96.034 101.506,96.576 101.610 C 97.212 101.732,97.362 101.892,97.092 102.162 C 96.477 102.777,96.655 104.123,97.404 104.524 C 98.569 105.147,98.331 109.587,97.082 110.510 C 96.462 110.968,95.999 111.822,95.672 113.107 C 94.792 116.567,94.030 117.452,93.184 116.000 C 92.674 115.124,92.675 117.758,93.186 119.597 C 93.667 121.330,93.360 122.667,92.481 122.667 C 92.066 122.667,91.648 123.098,91.359 123.822 C 91.105 124.458,90.628 125.378,90.298 125.867 C 89.969 126.356,89.512 127.332,89.283 128.037 C 89.055 128.741,88.458 129.701,87.956 130.170 C 87.454 130.639,86.822 131.447,86.552 131.966 C 86.282 132.486,85.851 133.126,85.593 133.389 C 85.336 133.652,84.944 134.347,84.723 134.933 C 84.502 135.520,83.897 137.096,83.379 138.436 C 82.368 141.051,82.274 142.534,82.543 151.520 L 82.667 155.662 84.622 156.079 C 85.698 156.308,87.938 156.886,89.600 157.363 C 91.262 157.841,92.837 158.229,93.100 158.227 C 94.987 158.209,101.349 160.722,103.865 162.479 C 106.679 164.444,110.222 167.223,110.222 167.464 C 110.222 167.992,115.415 172.896,116.890 173.761 C 119.227 175.130,122.432 175.287,124.141 174.116 C 124.854 173.627,125.761 173.124,126.157 172.999 C 127.094 172.701,131.405 169.262,132.120 168.241 C 132.425 167.806,133.787 166.889,135.146 166.204 C 136.506 165.520,137.934 164.644,138.320 164.258 C 138.706 163.872,139.342 163.556,139.733 163.556 C 140.810 163.556,140.635 162.115,139.365 160.517 C 138.676 159.650,138.375 158.957,138.532 158.601 C 138.668 158.295,138.906 156.284,139.062 154.133 C 139.217 151.982,139.450 149.321,139.580 148.219 C 139.716 147.057,139.663 145.945,139.455 145.573 C 139.194 145.106,139.242 144.706,139.631 144.113 C 140.377 142.975,139.358 142.591,137.807 143.426 C 133.337 145.833,123.466 143.370,120.893 139.206 C 120.444 138.480,119.792 137.967,119.156 137.840 C 118.531 137.715,118.063 137.353,117.946 136.905 C 117.824 136.439,117.354 136.093,116.655 135.953 C 116.050 135.832,115.556 135.508,115.556 135.233 C 115.556 134.958,115.319 134.642,115.029 134.531 C 114.740 134.420,114.146 133.751,113.709 133.044 C 112.774 131.531,111.787 130.489,111.289 130.489 C 111.093 130.489,110.933 130.344,110.933 130.166 C 110.933 129.988,110.213 129.102,109.333 128.197 C 108.453 127.291,107.733 126.345,107.733 126.093 C 107.733 125.841,107.329 125.255,106.834 124.791 C 106.240 124.232,105.530 122.675,104.738 120.195 C 104.079 118.132,103.190 115.644,102.764 114.667 C 102.337 113.689,101.659 111.929,101.257 110.756 C 100.855 109.582,100.228 108.336,99.863 107.986 C 99.335 107.480,99.200 106.823,99.200 104.762 C 99.200 103.338,98.940 101.304,98.623 100.242 C 98.187 98.785,98.097 97.526,98.255 95.111 C 98.565 90.384,98.776 89.600,99.740 89.600 C 100.753 89.600,101.000 88.965,101.165 85.938 C 101.311 83.262,101.575 82.133,102.055 82.133 C 102.229 82.133,102.683 81.799,103.064 81.391 C 103.900 80.493,104.391 81.340,103.981 82.973 C 103.856 83.468,103.926 84.402,104.135 85.048 C 104.759 86.975,104.764 95.410,104.141 96.408 C 103.778 96.992,103.683 97.762,103.829 98.956 C 103.944 99.897,103.909 100.746,103.752 100.843 C 103.595 100.940,103.486 101.690,103.509 102.510 L 103.552 104.000 103.915 102.489 C 104.663 99.381,105.253 100.640,105.166 105.156 C 105.091 109.065,105.148 109.461,106.054 111.323 C 106.820 112.898,107.023 113.825,107.026 115.768 C 107.028 117.632,107.242 118.680,107.915 120.124 C 108.402 121.170,108.800 122.229,108.800 122.476 C 108.800 122.724,109.097 123.308,109.459 123.774 C 109.822 124.241,110.310 125.208,110.543 125.924 C 110.777 126.640,111.195 127.313,111.473 127.420 C 111.750 127.526,112.215 128.181,112.505 128.876 C 112.795 129.570,113.400 130.278,113.849 130.450 C 114.762 130.799,115.573 131.639,116.308 132.996 C 117.601 135.380,118.284 136.173,119.224 136.380 C 119.775 136.501,120.317 136.837,120.428 137.127 C 120.539 137.417,121.528 138.060,122.626 138.557 C 123.724 139.053,124.862 139.666,125.156 139.919 C 125.449 140.172,126.404 140.569,127.279 140.802 C 128.153 141.035,129.188 141.450,129.580 141.724 C 130.444 142.329,132.326 142.376,132.895 141.807 C 133.388 141.314,135.740 140.457,136.622 140.450 C 136.964 140.447,137.564 140.124,137.956 139.733 C 138.347 139.342,138.921 139.022,139.232 139.022 C 139.542 139.022,140.481 138.342,141.316 137.511 C 142.152 136.680,143.218 135.714,143.685 135.365 C 145.237 134.204,147.227 132.978,147.559 132.978 C 147.739 132.978,148.057 132.658,148.267 132.267 C 148.476 131.876,148.853 131.556,149.104 131.556 C 149.355 131.556,150.110 131.057,150.780 130.447 C 151.451 129.837,152.509 129.119,153.132 128.852 C 153.754 128.585,154.474 128.084,154.732 127.738 C 156.063 125.954,159.191 125.751,159.745 127.413 C 159.814 127.621,160.980 127.855,162.336 127.933 C 164.672 128.067,164.829 128.131,165.353 129.168 C 165.684 129.823,166.356 130.413,167.028 130.642 C 167.646 130.851,168.541 131.551,169.017 132.198 C 170.068 133.624,172.405 135.443,173.204 135.457 C 173.523 135.462,174.031 135.842,174.332 136.301 C 174.632 136.760,175.411 137.353,176.061 137.619 C 176.712 137.884,177.697 138.549,178.250 139.095 C 178.802 139.642,179.386 140.089,179.547 140.089 C 179.708 140.089,180.386 140.609,181.052 141.244 C 181.719 141.880,183.215 143.075,184.377 143.899 C 185.538 144.723,187.646 146.523,189.059 147.899 C 190.473 149.275,191.758 150.400,191.914 150.400 C 192.070 150.400,192.638 150.903,193.177 151.517 C 194.655 153.201,198.230 152.891,202.001 150.753 C 205.894 148.547,209.617 148.151,212.519 149.635 C 213.342 150.056,214.270 150.400,214.581 150.400 C 214.891 150.400,215.530 150.815,216.000 151.323 C 216.471 151.831,217.499 152.390,218.285 152.567 C 219.244 152.783,220.240 153.414,221.314 154.488 C 222.194 155.369,223.219 156.089,223.592 156.089 C 223.964 156.089,224.464 156.325,224.703 156.613 C 224.942 156.901,225.722 157.244,226.436 157.376 C 227.149 157.508,228.053 157.955,228.444 158.370 C 228.836 158.785,229.740 159.568,230.454 160.111 C 232.277 161.496,232.611 164.965,231.042 166.218 C 229.460 167.483,229.245 168.068,230.077 168.843 C 230.836 169.550,230.840 169.589,230.189 169.830 C 229.816 169.968,229.417 170.221,229.301 170.392 C 229.186 170.563,228.751 170.728,228.336 170.759 C 227.730 170.805,227.621 170.981,227.787 171.645 C 227.909 172.130,227.782 172.725,227.481 173.081 C 226.902 173.766,226.133 176.220,226.133 177.386 C 226.133 177.809,225.898 178.246,225.610 178.357 C 225.322 178.467,224.985 179.096,224.861 179.755 C 224.738 180.414,224.413 181.138,224.141 181.364 C 223.868 181.591,223.642 182.036,223.639 182.355 C 223.636 182.673,223.425 183.333,223.169 183.822 C 222.725 184.672,224.250 188.406,225.908 190.528 C 226.116 190.794,226.254 192.070,226.216 193.363 C 226.145 195.773,227.434 198.044,228.873 198.044 C 229.130 198.044,229.619 198.378,229.959 198.785 C 230.299 199.192,231.418 200.088,232.444 200.775 C 233.471 201.462,234.311 202.162,234.311 202.330 C 234.311 202.497,234.831 202.733,235.467 202.854 C 236.708 203.090,238.578 204.495,238.578 205.191 C 238.578 205.424,239.128 206.444,239.800 207.456 C 240.472 208.469,241.132 209.738,241.268 210.277 C 241.403 210.816,241.893 211.430,242.357 211.641 C 243.321 212.080,243.456 213.033,242.650 213.703 C 241.879 214.343,242.140 215.620,243.068 215.752 C 243.638 215.834,243.891 215.615,244.093 214.863 L 244.362 213.867 244.678 215.014 C 244.852 215.645,245.310 216.331,245.697 216.538 C 246.084 216.745,246.400 217.081,246.400 217.284 C 246.400 217.488,246.861 218.116,247.424 218.679 C 247.988 219.242,248.560 220.149,248.697 220.693 C 248.834 221.237,249.060 221.763,249.200 221.863 C 249.631 222.171,251.022 224.725,251.022 225.210 C 251.022 225.462,251.324 225.940,251.692 226.274 C 252.061 226.607,252.562 227.596,252.807 228.471 C 253.256 230.075,256.531 233.600,257.572 233.600 C 258.286 233.600,265.956 241.493,265.956 242.228 C 265.956 242.447,266.876 243.522,268.000 244.617 C 270.414 246.968,271.897 248.654,272.883 250.167 C 274.034 251.933,276.763 254.933,277.219 254.933 C 277.450 254.933,277.914 255.213,278.251 255.556 C 278.588 255.898,279.216 256.418,279.648 256.711 C 280.079 257.004,281.029 257.772,281.759 258.417 L 283.085 259.589 283.187 267.128 C 283.251 271.893,283.465 275.386,283.767 276.622 C 285.021 281.753,284.269 293.324,282.275 299.556 C 281.900 300.729,281.594 302.030,281.596 302.446 C 281.600 303.155,280.372 306.265,279.298 308.267 C 279.035 308.756,278.702 309.796,278.556 310.578 C 278.411 311.360,277.996 312.209,277.635 312.465 C 277.255 312.733,276.978 313.362,276.978 313.955 C 276.978 314.520,276.675 315.511,276.306 316.157 C 275.937 316.804,275.529 317.933,275.401 318.667 C 275.273 319.400,275.027 320.000,274.856 320.000 C 274.684 320.000,274.351 320.600,274.116 321.333 C 273.881 322.067,273.499 322.907,273.268 323.200 C 273.037 323.493,272.647 324.133,272.401 324.622 C 271.386 326.634,270.713 327.687,269.955 328.445 C 269.515 328.885,269.156 329.467,269.156 329.740 C 269.156 330.012,268.916 330.327,268.622 330.440 C 268.329 330.552,268.089 330.865,268.089 331.134 C 268.089 331.403,267.747 331.928,267.329 332.300 C 266.911 332.673,266.348 333.458,266.079 334.044 C 265.458 335.397,264.917 336.268,263.911 337.536 C 263.471 338.090,263.111 338.697,263.111 338.885 C 263.111 339.072,262.425 339.941,261.587 340.816 L 260.063 342.406 238.032 342.455 C 225.914 342.482,215.200 342.645,214.222 342.817 C 212.894 343.050,211.243 342.939,207.693 342.378 C 203.027 341.641,202.253 341.637,196.800 342.320 C 195.431 342.492,179.911 342.590,162.311 342.538 C 108.460 342.381,29.893 342.338,19.378 342.461 C 9.315 342.579,4.642 342.200,4.001 341.213 C 3.854 340.986,3.551 340.080,3.327 339.200 C 3.104 338.320,2.755 337.120,2.552 336.533 C 2.350 335.947,1.892 334.359,1.536 333.006 C 0.808 330.239,0.000 329.474,0.000 331.551 C 0.000 332.266,0.218 333.069,0.485 333.336 C 0.752 333.603,1.084 334.991,1.223 336.422 C 1.589 340.195,2.091 342.252,2.802 342.895 C 3.372 343.411,14.972 343.462,132.460 343.473 L 261.492 343.485 262.403 342.498 C 263.577 341.227,265.818 337.637,266.871 335.342 C 267.172 334.686,267.729 333.816,268.109 333.408 C 268.489 333.000,268.800 332.456,268.800 332.200 C 268.800 331.943,268.940 331.733,269.111 331.733 C 269.531 331.733,272.903 326.805,273.246 325.689 C 273.397 325.200,273.818 324.418,274.182 323.952 C 274.546 323.486,274.844 322.871,274.844 322.586 C 274.844 322.301,275.164 321.661,275.556 321.164 C 275.947 320.666,276.267 320.061,276.267 319.817 C 276.267 319.574,276.682 318.435,277.190 317.287 C 277.698 316.139,278.325 314.720,278.585 314.133 C 278.844 313.547,279.176 312.587,279.322 312.000 C 279.468 311.413,279.879 310.453,280.237 309.867 C 280.594 309.280,280.887 308.519,280.888 308.176 C 280.888 307.834,281.209 306.956,281.600 306.226 C 281.991 305.496,282.312 304.577,282.313 304.183 C 282.315 303.789,282.556 303.005,282.850 302.442 C 283.144 301.878,283.481 300.758,283.599 299.953 C 283.717 299.148,284.221 297.049,284.719 295.289 C 285.806 291.450,285.931 281.642,284.995 273.674 C 284.646 270.698,284.526 267.538,284.650 264.531 C 284.892 258.628,284.827 258.513,278.222 253.207 C 275.301 250.860,273.644 249.298,273.205 248.476 C 273.031 248.151,272.322 247.271,271.628 246.520 C 269.887 244.636,267.244 241.672,264.711 238.764 C 261.451 235.021,260.202 233.831,258.009 232.376 C 256.901 231.640,255.677 230.615,255.290 230.097 C 254.902 229.579,254.426 228.965,254.232 228.732 C 254.037 228.499,253.605 227.619,253.271 226.776 C 252.938 225.934,252.376 224.764,252.023 224.178 C 251.670 223.591,251.380 222.756,251.379 222.322 C 251.377 221.301,250.160 218.955,248.468 216.711 C 247.731 215.733,246.720 214.373,246.222 213.689 C 245.724 213.004,244.720 211.644,243.991 210.667 C 243.263 209.689,242.278 208.169,241.802 207.289 C 240.017 203.983,238.379 202.115,236.872 201.663 C 235.942 201.385,234.795 200.563,233.589 199.311 C 232.570 198.252,231.053 197.024,230.218 196.581 C 228.862 195.862,228.677 195.608,228.484 194.200 C 228.220 192.271,226.802 188.265,225.806 186.630 C 224.513 184.510,224.736 183.707,228.560 176.711 C 228.935 176.027,229.517 174.939,229.855 174.293 C 230.193 173.648,231.454 171.621,232.657 169.789 C 237.290 162.734,237.487 162.195,236.000 160.602 C 234.567 159.066,230.263 156.369,224.477 153.382 C 222.490 152.356,220.090 150.974,219.143 150.311 C 218.197 149.647,216.873 148.914,216.201 148.681 C 215.529 148.448,214.672 147.980,214.296 147.640 C 212.234 145.775,205.451 147.224,198.756 150.960 C 197.220 151.817,195.755 151.593,194.436 150.299 C 193.780 149.657,192.524 148.546,191.644 147.830 C 190.764 147.114,189.095 145.639,187.935 144.553 C 186.775 143.466,185.690 142.578,185.524 142.578 C 185.244 142.578,181.340 139.477,179.733 137.978 C 179.342 137.613,178.528 137.019,177.923 136.657 C 176.335 135.707,173.039 133.077,170.862 131.022 C 166.170 126.594,165.360 126.032,163.200 125.703 C 159.609 125.156,159.438 124.429,162.224 121.565 C 167.184 116.465,170.457 111.644,171.736 107.556 C 171.980 106.773,172.385 105.733,172.634 105.244 C 173.631 103.293,174.903 100.396,175.133 99.556 C 175.267 99.067,175.530 98.474,175.718 98.239 C 175.906 98.003,176.596 96.723,177.250 95.394 C 177.905 94.065,178.971 92.389,179.620 91.669 C 180.269 90.949,181.338 89.472,181.996 88.387 C 183.108 86.555,184.398 85.437,188.122 83.078 C 188.690 82.718,189.156 82.278,189.156 82.101 C 189.156 81.923,189.463 81.778,189.839 81.778 C 190.215 81.778,190.975 81.412,191.528 80.964 C 192.081 80.516,192.973 79.960,193.511 79.727 C 194.049 79.494,194.489 79.154,194.489 78.970 C 194.489 78.786,195.809 77.635,197.422 76.412 C 199.036 75.189,200.506 73.936,200.689 73.627 C 200.873 73.319,201.567 72.587,202.232 72.000 C 205.510 69.108,206.761 62.505,205.229 56.178 C 204.827 54.516,204.431 51.956,204.349 50.489 C 204.219 48.163,203.655 45.808,202.263 41.778 C 201.291 38.963,200.639 37.354,200.296 36.920 C 200.089 36.659,199.828 35.630,199.717 34.634 C 199.538 33.039,198.919 31.387,197.597 28.978 C 197.383 28.587,197.029 27.927,196.812 27.513 C 196.595 27.098,195.623 26.079,194.653 25.248 C 193.683 24.417,188.496 19.339,183.126 13.963 C 177.172 8.002,172.665 3.782,171.571 3.146 C 170.585 2.571,169.538 1.962,169.244 1.791 C 168.951 1.621,168.191 1.288,167.556 1.053 C 166.920 0.817,166.400 0.484,166.400 0.312 C 166.400 0.141,165.760 0.000,164.978 0.000 C 162.582 0.000,163.310 1.081,166.194 1.808 C 167.152 2.049,168.230 2.541,168.590 2.901 C 168.950 3.261,169.484 3.556,169.778 3.556 C 170.071 3.556,170.593 3.838,170.938 4.183 C 171.283 4.527,172.074 5.172,172.696 5.615 C 173.993 6.538,179.472 11.701,182.173 14.545 C 185.500 18.047,192.529 25.047,193.989 26.311 C 195.909 27.974,199.111 34.080,199.111 36.078 C 199.111 36.586,199.366 37.595,199.678 38.323 C 201.728 43.103,203.219 48.741,203.735 53.673 C 203.970 55.913,204.306 58.124,204.481 58.585 C 206.466 63.807,203.620 70.136,197.057 75.093 C 195.742 76.086,194.187 77.370,193.600 77.947 C 193.013 78.523,192.093 79.225,191.556 79.506 C 191.018 79.788,190.578 80.161,190.578 80.336 C 190.578 80.511,190.099 80.760,189.513 80.888 C 188.928 81.017,188.328 81.310,188.180 81.539 C 188.032 81.768,186.951 82.593,185.778 83.373 C 184.604 84.153,183.563 84.873,183.464 84.973 C 183.364 85.073,182.861 85.527,182.347 85.981 L 181.410 86.807 180.349 85.769 C 178.509 83.971,173.080 83.839,172.419 85.577 C 172.240 86.049,171.625 86.599,171.053 86.798 C 169.486 87.344,169.409 88.088,170.856 88.693 C 172.247 89.274,172.623 90.855,171.467 91.265 C 169.504 91.961,169.080 93.367,170.666 93.920 C 172.108 94.422,171.683 94.938,170.047 94.673 C 169.195 94.534,168.333 94.040,167.611 93.274 C 166.922 92.543,166.152 92.089,165.602 92.089 C 164.591 92.089,163.647 91.228,164.249 90.855 C 164.454 90.728,164.620 90.194,164.617 89.668 C 164.603 86.917,163.537 86.353,161.966 88.267 C 159.951 90.722,158.933 92.207,158.933 92.692 C 158.933 92.970,158.773 93.099,158.578 92.978 C 157.667 92.415,158.410 89.303,159.808 87.822 C 160.269 87.333,161.129 86.413,161.718 85.778 C 162.391 85.052,163.130 84.622,163.703 84.622 C 164.355 84.622,164.845 84.268,165.419 83.382 C 165.931 82.592,166.505 82.141,167.001 82.138 C 168.179 82.131,168.269 81.682,167.814 78.122 C 167.073 72.324,166.666 71.786,164.046 73.139 C 161.858 74.269,161.149 72.594,162.749 70.073 C 163.810 68.403,165.689 64.695,165.695 64.262 C 165.698 64.020,166.102 63.442,166.591 62.978 C 167.285 62.320,167.391 62.026,167.075 61.645 C 166.472 60.919,165.755 61.048,164.829 62.047 C 163.580 63.394,161.488 64.711,160.597 64.711 C 160.160 64.711,159.487 64.928,159.101 65.194 C 158.716 65.459,157.794 65.874,157.054 66.115 C 154.286 67.015,152.346 69.894,153.934 70.744 C 154.348 70.966,154.593 71.299,154.478 71.485 C 154.182 71.963,152.757 71.904,152.245 71.392 C 151.984 71.131,150.989 70.994,149.712 71.045 C 147.873 71.117,147.580 71.037,147.380 70.408 C 147.255 70.013,147.025 69.689,146.869 69.689 C 146.714 69.689,145.969 69.198,145.213 68.598 C 144.115 67.725,143.619 67.548,142.732 67.714 C 141.689 67.910,141.584 67.827,140.971 66.342 C 140.613 65.473,140.068 64.689,139.760 64.600 C 139.452 64.511,137.988 64.106,136.507 63.701 C 135.026 63.295,133.356 62.789,132.796 62.576 L 131.778 62.189 132.952 61.475 C 133.599 61.082,134.469 60.787,134.886 60.819 C 136.302 60.930,136.931 60.801,136.711 60.444 C 136.590 60.249,136.039 60.089,135.486 60.089 C 134.041 60.089,133.235 56.234,134.222 54.045 C 134.617 53.169,134.757 52.319,134.605 51.715 L 134.366 50.763 132.969 52.277 C 132.200 53.109,131.474 54.096,131.355 54.470 C 131.170 55.054,130.962 54.922,129.878 53.531 C 128.509 51.773,128.971 51.897,123.911 51.930 C 121.833 51.944,120.251 52.543,119.972 53.422 C 119.863 53.764,119.617 54.044,119.426 54.044 C 118.740 54.044,117.372 56.025,117.143 57.350 C 116.961 58.402,116.613 58.888,115.571 59.546 C 114.615 60.149,114.166 60.727,113.998 61.568 C 113.868 62.216,113.277 63.349,112.684 64.087 C 112.090 64.826,111.356 66.026,111.052 66.754 C 110.747 67.483,110.036 68.551,109.471 69.129 C 108.907 69.707,108.444 70.283,108.444 70.410 C 108.444 70.747,106.746 71.467,105.951 71.467 C 105.049 71.467,104.672 70.651,104.429 68.171 C 104.312 66.983,103.898 65.586,103.443 64.851 C 102.813 63.831,102.632 62.907,102.520 60.147 C 102.346 55.845,102.206 55.210,101.373 54.946 C 100.971 54.818,100.438 53.993,100.038 52.878 C 99.457 51.255,99.240 51.009,98.309 50.919 C 95.567 50.653,94.539 49.366,96.690 48.893 C 97.657 48.681,97.686 48.600,98.122 44.872 C 98.586 40.904,100.021 34.866,100.798 33.615 C 101.046 33.216,101.360 32.409,101.497 31.822 C 101.633 31.236,101.953 30.516,102.208 30.222 C 102.463 29.929,102.786 29.312,102.927 28.852 C 103.067 28.392,103.563 27.455,104.028 26.770 C 104.493 26.084,105.279 24.701,105.775 23.695 C 106.270 22.689,107.480 20.747,108.463 19.378 C 109.446 18.009,110.388 16.558,110.558 16.154 C 111.039 15.007,112.573 12.854,113.792 11.616 C 114.402 10.996,115.108 9.998,115.361 9.398 C 115.614 8.797,116.327 7.917,116.946 7.442 C 117.564 6.967,118.606 6.138,119.260 5.600 C 119.914 5.062,120.629 4.622,120.848 4.622 C 121.068 4.622,121.844 4.302,122.574 3.911 C 123.304 3.520,124.130 3.200,124.411 3.200 C 124.692 3.200,125.192 2.955,125.523 2.656 C 125.853 2.357,127.042 1.963,128.163 1.780 C 130.959 1.325,131.556 1.102,131.556 0.509 C 131.556 -0.199,128.157 -0.210,127.885 0.498 M155.378 53.276 C 155.378 53.440,154.969 53.761,154.469 53.989 C 153.390 54.480,153.631 55.208,154.737 54.799 C 155.520 54.510,156.348 52.978,155.722 52.978 C 155.533 52.978,155.378 53.112,155.378 53.276 M138.447 56.356 C 137.706 57.680,137.539 59.596,138.122 60.080 C 138.862 60.693,139.092 59.994,138.954 57.558 C 138.861 55.931,138.785 55.751,138.447 56.356 M173.536 71.065 C 173.330 71.450,172.698 71.866,172.131 71.991 C 169.205 72.633,166.861 77.879,169.511 77.854 C 171.855 77.832,174.222 75.517,174.222 73.249 C 174.222 72.591,174.504 72.021,175.001 71.673 C 175.861 71.070,175.827 70.955,174.688 70.605 C 174.120 70.430,173.809 70.555,173.536 71.065 M139.035 73.161 C 142.228 73.761,142.510 75.222,139.788 77.067 C 137.605 78.547,137.611 78.548,135.289 76.444 C 134.209 75.467,133.167 74.667,132.974 74.667 C 132.474 74.667,132.538 73.473,133.067 72.930 C 133.527 72.457,135.745 72.543,139.035 73.161 M144.000 75.485 C 144.848 76.185,145.455 77.449,145.059 77.693 C 144.868 77.812,144.711 77.659,144.711 77.354 C 144.711 77.049,144.411 76.800,144.044 76.800 C 143.243 76.800,142.425 75.913,142.746 75.393 C 143.040 74.917,143.338 74.939,144.000 75.485 M225.702 84.015 C 223.631 85.705,223.524 86.425,223.794 96.834 C 224.079 107.825,224.107 107.688,221.460 107.987 C 219.947 108.157,219.830 108.108,219.478 107.151 C 218.864 105.487,218.669 95.846,219.133 90.133 L 219.422 86.578 218.198 85.203 C 217.010 83.868,216.937 83.840,215.708 84.246 C 213.511 84.971,213.370 86.199,213.704 101.689 C 213.710 101.982,213.805 103.058,213.914 104.080 C 214.274 107.462,213.364 108.592,210.731 108.031 C 208.669 107.591,208.763 108.129,208.624 95.961 L 208.516 86.500 207.529 85.206 C 206.371 83.688,205.463 83.571,204.251 84.784 L 203.378 85.657 203.378 99.318 C 203.378 109.936,203.478 113.063,203.830 113.355 C 204.719 114.092,227.647 114.347,228.367 113.627 C 229.013 112.981,229.333 86.065,228.706 85.116 C 228.134 84.253,226.255 83.564,225.702 84.015 M376.519 84.504 C 375.854 84.960,375.102 85.333,374.848 85.333 C 372.752 85.333,371.091 89.846,372.622 91.378 C 373.460 92.215,375.741 92.358,376.035 91.592 C 376.775 89.663,380.622 90.339,381.690 92.584 L 382.403 94.082 381.600 95.274 C 380.864 96.366,377.931 99.346,377.324 99.618 C 375.577 100.401,374.384 104.554,375.613 105.574 C 377.114 106.820,378.385 106.475,380.970 104.121 C 385.620 99.888,386.841 98.345,386.843 96.701 C 386.844 96.207,387.078 95.469,387.364 95.061 C 387.814 94.418,387.816 94.231,387.375 93.649 C 387.096 93.280,386.862 92.509,386.856 91.936 C 386.842 90.701,386.110 88.533,385.706 88.533 C 385.550 88.533,385.422 88.304,385.422 88.024 C 385.422 87.744,385.102 87.413,384.711 87.289 C 384.319 87.165,383.834 86.754,383.632 86.377 C 382.596 84.441,378.272 83.303,376.519 84.504 M380.267 85.333 C 380.853 85.722,381.546 86.041,381.805 86.042 C 384.528 86.056,387.272 93.785,385.845 97.422 C 385.041 99.471,378.206 105.724,377.132 105.394 C 374.811 104.682,375.757 102.042,379.392 99.088 C 383.965 95.372,384.286 92.612,380.472 89.798 C 379.004 88.715,376.354 89.380,375.063 91.155 C 374.655 91.716,372.622 90.219,372.622 89.358 C 372.622 88.219,374.633 86.044,375.685 86.044 C 376.155 86.044,376.814 85.724,377.149 85.333 C 377.919 84.434,378.908 84.434,380.267 85.333 M207.112 87.951 C 207.233 88.956,207.447 93.817,207.588 98.753 C 207.886 109.259,207.752 108.892,211.300 108.944 C 214.961 108.998,214.755 109.691,214.761 97.290 C 214.767 86.332,214.801 85.995,215.963 85.565 C 217.671 84.933,217.867 85.839,217.748 93.789 C 217.524 108.691,217.753 109.499,222.056 108.961 C 225.310 108.554,225.164 109.006,225.055 99.708 C 224.883 84.948,225.133 83.509,227.489 85.703 C 228.246 86.409,228.702 109.300,228.018 112.267 L 227.834 113.067 216.584 113.061 C 210.117 113.058,205.107 112.912,204.800 112.719 C 204.245 112.368,203.857 86.919,204.396 86.178 C 205.656 84.444,206.778 85.176,207.112 87.951 M166.270 86.143 C 165.708 86.554,165.774 86.644,166.948 87.068 C 168.467 87.617,169.322 87.173,168.546 86.237 C 167.992 85.570,167.104 85.534,166.270 86.143 M176.356 90.000 C 176.356 90.340,176.024 90.724,175.619 90.853 C 175.124 91.010,174.954 91.275,175.102 91.660 C 175.889 93.710,175.743 95.245,174.659 96.329 C 173.347 97.641,173.193 97.403,172.898 93.610 C 172.704 91.114,172.724 91.034,173.595 90.702 C 174.131 90.498,174.658 89.888,174.909 89.181 C 175.358 87.913,176.356 88.477,176.356 90.000 M343.065 92.448 C 342.601 92.830,342.022 93.312,341.778 93.519 C 341.533 93.725,341.328 94.328,341.321 94.858 L 341.309 95.822 340.220 94.489 C 338.538 92.430,335.289 92.985,335.289 95.331 C 335.289 95.671,335.030 96.208,334.714 96.524 C 334.398 96.840,334.003 97.707,333.836 98.450 C 333.315 100.768,331.864 103.035,331.566 101.997 C 331.304 101.087,330.154 98.498,329.375 97.067 C 329.109 96.578,328.628 95.581,328.306 94.851 C 327.664 93.399,325.814 92.684,324.623 93.428 C 324.260 93.655,323.828 93.677,323.524 93.484 C 322.398 92.771,310.104 93.091,309.701 93.843 C 308.398 96.279,309.354 98.208,312.000 98.483 L 313.778 98.667 313.867 105.778 C 313.968 113.758,314.093 114.133,316.662 114.133 C 319.133 114.133,319.289 113.626,319.289 105.600 L 319.289 98.489 321.778 98.489 C 323.149 98.489,324.267 98.644,324.267 98.834 C 324.267 99.024,324.667 100.054,325.156 101.124 C 325.646 102.194,326.205 103.439,326.400 103.890 C 326.595 104.342,326.905 104.951,327.089 105.244 C 327.273 105.538,327.514 106.207,327.624 106.731 C 327.734 107.255,328.103 107.964,328.445 108.306 C 329.254 109.117,329.230 112.456,328.410 113.363 C 328.099 113.705,327.738 114.899,327.607 116.015 C 327.476 117.131,327.237 118.044,327.076 118.044 C 325.583 118.044,325.971 122.167,327.584 123.442 L 328.789 124.395 330.042 123.503 C 331.003 122.820,331.349 122.277,331.525 121.180 C 331.651 120.392,331.975 119.319,332.246 118.795 C 332.517 118.271,332.851 117.246,332.988 116.517 C 333.124 115.788,333.538 114.600,333.907 113.877 C 334.276 113.153,334.579 112.315,334.580 112.014 C 334.581 111.713,334.900 110.987,335.289 110.400 C 335.677 109.813,335.996 109.007,335.998 108.609 C 335.999 108.210,336.311 107.274,336.690 106.529 C 337.070 105.784,337.489 104.684,337.621 104.084 C 337.752 103.484,338.161 102.499,338.529 101.896 C 338.897 101.293,339.198 100.377,339.199 99.860 C 339.199 99.307,339.640 98.449,340.267 97.778 L 341.333 96.636 341.338 109.029 C 341.343 121.652,341.429 123.022,342.220 123.022 C 342.467 123.022,342.868 123.262,343.111 123.556 C 344.735 125.512,346.665 122.996,346.672 118.914 C 346.679 114.177,346.631 114.257,349.562 114.047 C 352.235 113.856,353.523 113.052,354.680 110.854 C 354.966 110.311,355.473 109.347,355.807 108.711 L 356.413 107.556 356.733 108.898 C 357.685 112.895,362.185 114.881,368.080 113.906 C 372.661 113.149,370.976 107.837,366.306 108.315 C 364.280 108.523,363.980 108.466,363.188 107.722 C 361.969 106.577,362.063 106.412,364.092 106.133 C 368.279 105.557,368.088 101.006,363.862 100.629 L 361.789 100.444 362.846 99.467 C 364.105 98.303,364.753 98.248,365.964 99.200 C 367.673 100.545,369.792 99.975,371.003 97.846 C 371.277 97.364,369.585 94.578,369.018 94.578 C 368.849 94.578,368.391 94.258,368.000 93.867 C 367.395 93.262,366.815 93.156,364.118 93.156 L 360.947 93.156 359.496 94.550 C 358.698 95.317,358.044 96.219,358.044 96.555 C 358.044 96.891,357.784 97.357,357.465 97.590 C 357.146 97.823,356.772 98.641,356.634 99.407 L 356.383 100.800 356.098 99.418 C 355.788 97.913,354.878 96.274,353.297 94.374 L 352.282 93.156 348.962 93.156 C 347.136 93.156,345.544 92.996,345.423 92.802 C 344.865 91.899,343.906 91.755,343.065 92.448 M236.104 93.778 C 234.641 94.860,232.533 97.023,232.533 97.442 C 232.533 97.664,232.236 98.270,231.873 98.790 C 231.510 99.309,231.121 100.664,231.007 101.802 C 230.894 102.940,230.628 104.080,230.416 104.336 C 230.136 104.673,230.179 105.369,230.571 106.875 C 230.868 108.016,231.111 109.183,231.111 109.469 C 231.111 110.657,234.971 113.829,236.728 114.085 C 240.678 114.661,245.689 112.714,245.689 110.602 C 245.689 110.453,246.005 109.966,246.392 109.520 C 246.779 109.074,247.202 108.129,247.332 107.421 C 247.461 106.713,247.785 105.818,248.050 105.432 C 248.805 104.337,248.660 100.434,247.781 98.140 C 246.679 95.268,246.608 95.158,245.481 94.606 C 244.914 94.328,244.237 93.888,243.977 93.628 C 243.218 92.869,237.177 92.984,236.104 93.778 M262.464 93.612 C 261.523 94.746,261.333 96.422,261.311 103.801 C 261.292 110.095,261.394 111.812,261.848 112.899 L 262.408 114.239 266.404 114.033 C 271.086 113.793,274.275 112.490,274.714 110.640 C 274.838 110.117,275.179 109.414,275.470 109.078 C 275.762 108.743,275.911 108.183,275.801 107.834 C 275.132 105.702,274.500 104.354,273.998 103.987 C 273.254 103.443,273.269 102.803,274.044 101.946 C 275.011 100.878,274.903 97.683,273.867 96.718 C 273.427 96.308,273.067 95.832,273.067 95.661 C 273.067 93.755,263.828 91.969,262.464 93.612 M277.284 93.956 C 276.933 94.608,276.651 98.451,276.676 102.222 C 276.692 104.531,276.611 109.574,276.536 110.987 C 276.298 115.446,280.486 115.472,281.204 111.015 C 282.180 104.953,287.071 104.275,287.418 110.155 C 287.514 111.780,287.784 113.340,288.018 113.621 C 288.540 114.250,291.051 114.300,291.443 113.689 C 292.037 112.761,292.612 110.707,292.617 109.490 C 292.626 107.274,293.530 106.571,293.804 108.567 C 294.405 112.954,298.398 115.215,303.111 113.837 C 303.698 113.666,304.498 113.651,304.889 113.804 C 306.084 114.273,307.709 114.164,308.577 113.556 C 309.461 112.937,309.464 112.690,308.634 108.978 C 308.406 107.958,308.273 104.723,308.323 101.388 C 308.394 96.615,308.318 95.522,307.894 95.278 C 307.610 95.115,306.827 94.571,306.153 94.068 C 304.499 92.835,299.756 92.706,298.762 93.867 C 298.427 94.258,298.016 94.578,297.849 94.578 C 297.492 94.578,295.467 96.547,295.467 96.894 C 295.467 97.025,295.160 97.522,294.785 97.999 C 294.410 98.475,294.000 99.480,293.873 100.231 C 293.708 101.204,293.393 101.709,292.777 101.990 C 291.953 102.366,291.609 102.109,292.177 101.542 C 292.802 100.916,292.604 96.193,291.887 94.647 C 291.198 93.161,291.134 93.119,289.678 93.225 C 287.855 93.357,287.341 94.431,287.309 98.173 L 287.289 100.524 285.021 100.756 C 281.715 101.095,281.526 100.960,281.808 98.470 C 282.272 94.374,278.879 90.989,277.284 93.956 M345.028 94.072 C 345.281 94.730,346.830 94.720,347.846 94.054 C 352.312 91.128,357.786 102.143,354.768 107.979 C 354.281 108.920,353.784 110.089,353.662 110.578 C 353.313 111.979,351.200 113.180,348.775 113.355 C 345.979 113.557,345.772 113.869,345.894 117.692 C 346.012 121.402,345.208 122.939,343.389 122.482 C 342.052 122.147,341.995 121.445,342.118 106.677 L 342.222 94.065 343.073 93.641 C 344.030 93.164,344.740 93.321,345.028 94.072 M160.552 93.898 C 160.684 94.110,160.652 94.424,160.482 94.594 C 160.061 95.014,159.136 94.402,159.442 93.906 C 159.753 93.404,160.245 93.400,160.552 93.898 M244.027 94.804 C 244.580 95.266,245.174 95.644,245.348 95.644 C 247.555 95.644,247.953 106.108,245.836 108.472 C 245.560 108.781,245.333 109.230,245.333 109.471 C 245.333 112.426,237.375 114.672,234.913 112.412 C 232.483 110.182,231.829 109.266,231.606 107.779 C 231.268 105.527,231.668 100.680,232.250 99.974 C 232.521 99.646,232.975 98.898,233.259 98.311 C 233.544 97.724,233.873 97.164,233.991 97.067 C 234.108 96.969,234.394 96.529,234.626 96.089 C 234.858 95.649,235.210 95.289,235.409 95.289 C 235.608 95.289,236.363 94.883,237.086 94.387 C 238.796 93.214,242.385 93.429,244.027 94.804 M305.538 94.863 C 307.603 96.253,307.988 96.953,307.359 98.169 C 306.728 99.389,306.647 106.128,307.245 107.621 C 307.868 109.174,308.239 111.384,308.027 112.267 C 307.815 113.146,305.921 113.423,305.180 112.683 C 304.905 112.407,304.327 112.458,303.141 112.860 C 300.024 113.919,296.751 113.167,295.879 111.194 C 295.813 111.043,295.496 110.658,295.174 110.336 C 294.146 109.308,294.022 99.892,295.028 99.241 C 295.215 99.121,295.627 98.515,295.945 97.895 C 297.877 94.122,302.342 92.711,305.538 94.863 M323.174 94.827 L 324.037 95.749 324.787 94.808 C 325.818 93.515,327.822 94.312,327.822 96.014 C 327.822 96.345,328.132 97.009,328.511 97.491 C 328.890 97.973,329.312 98.835,329.448 99.406 C 329.584 99.977,329.894 100.684,330.136 100.978 C 330.378 101.271,330.769 102.109,331.003 102.839 C 331.238 103.570,331.554 104.245,331.707 104.339 C 332.101 104.583,334.093 101.373,334.379 100.035 C 334.511 99.418,334.930 98.304,335.310 97.560 C 335.689 96.815,336.000 96.027,336.000 95.809 C 336.000 95.117,337.709 93.764,338.298 93.990 C 339.250 94.356,339.555 95.764,339.012 97.288 C 338.741 98.046,338.513 98.991,338.504 99.388 C 338.496 99.784,338.272 100.424,338.006 100.810 C 337.741 101.196,337.320 102.151,337.071 102.933 C 336.822 103.716,336.496 104.516,336.345 104.711 C 336.195 104.907,335.832 105.867,335.539 106.844 C 335.246 107.822,334.750 109.102,334.438 109.689 C 334.126 110.276,333.870 110.956,333.869 111.201 C 333.868 111.446,333.547 112.244,333.156 112.974 C 332.764 113.704,332.444 114.671,332.444 115.124 C 332.444 115.576,332.177 116.458,331.849 117.084 C 331.522 117.710,331.078 119.090,330.862 120.151 C 330.397 122.441,329.089 123.280,327.802 122.115 C 326.972 121.364,326.937 120.680,327.644 118.988 C 327.938 118.286,328.178 117.316,328.178 116.832 C 328.178 116.348,328.537 115.343,328.977 114.598 C 330.113 112.673,330.114 108.962,328.978 107.423 C 328.538 106.827,328.178 106.102,328.178 105.811 C 328.178 105.520,327.778 104.530,327.289 103.610 C 326.800 102.691,326.400 101.652,326.400 101.301 C 326.400 100.951,326.261 100.578,326.091 100.473 C 325.920 100.368,325.423 99.324,324.985 98.153 L 324.189 96.023 323.039 96.901 C 322.406 97.383,321.474 97.778,320.967 97.778 C 320.461 97.778,319.639 97.933,319.142 98.122 L 318.237 98.466 318.141 105.677 L 318.044 112.889 317.023 113.006 C 315.319 113.200,315.213 112.806,315.022 105.554 C 314.824 98.020,314.739 97.778,312.300 97.778 C 310.404 97.778,309.424 94.459,311.200 94.053 C 314.961 93.192,322.075 93.652,323.174 94.827 M270.620 94.918 C 273.154 96.596,274.624 100.189,273.244 101.333 C 272.583 101.882,272.545 103.953,273.186 104.485 C 274.636 105.688,274.704 109.722,273.294 110.892 C 270.402 113.293,263.321 114.304,262.578 112.423 C 261.881 110.656,262.389 95.525,263.173 94.689 C 264.416 93.366,268.466 93.490,270.620 94.918 M280.318 94.429 C 280.436 94.738,280.533 96.308,280.533 97.917 C 280.533 102.058,280.766 102.304,284.132 101.722 C 288.502 100.967,288.313 101.160,288.431 97.347 L 288.533 94.044 289.644 93.936 C 291.227 93.782,291.264 94.008,291.232 103.783 C 291.203 113.065,291.113 113.544,289.453 113.351 C 288.542 113.245,288.532 113.211,288.432 109.783 C 288.311 105.689,288.081 105.432,284.750 105.672 C 281.971 105.873,280.533 107.130,280.533 109.355 C 280.533 112.241,280.205 113.067,279.058 113.067 C 278.312 113.067,277.947 112.846,277.736 112.267 C 277.395 111.327,277.496 95.747,277.850 94.630 C 278.145 93.700,279.981 93.551,280.318 94.429 M366.974 94.517 C 367.441 94.875,368.105 95.271,368.450 95.397 C 369.378 95.736,369.846 97.240,369.357 98.313 C 368.887 99.345,368.142 99.438,366.963 98.612 C 365.476 97.570,362.721 97.920,361.559 99.298 C 360.366 100.712,360.565 100.936,363.364 101.331 C 365.901 101.690,365.696 101.573,365.997 102.828 C 366.314 104.151,365.211 105.109,362.793 105.611 C 360.667 106.052,360.527 106.370,361.782 107.906 C 362.605 108.913,362.815 108.976,365.947 109.150 L 369.244 109.333 369.349 110.578 C 369.708 114.840,361.662 114.314,358.439 109.864 C 356.796 107.596,356.626 100.073,358.174 98.170 C 358.396 97.898,358.738 97.304,358.933 96.853 C 359.987 94.418,364.962 92.973,366.974 94.517 M157.185 98.754 C 156.903 99.238,156.819 98.965,156.811 97.540 C 156.795 94.925,157.304 93.895,157.441 96.265 C 157.500 97.291,157.385 98.411,157.185 98.754 M265.956 97.778 C 264.810 98.923,265.010 100.558,266.365 101.128 C 269.335 102.376,271.600 99.048,268.775 97.587 C 267.425 96.889,266.802 96.931,265.956 97.778 M238.933 98.071 C 237.593 98.433,236.153 99.873,235.888 101.116 C 235.758 101.724,235.503 102.407,235.322 102.632 C 233.293 105.157,235.507 109.156,238.933 109.156 C 241.022 109.156,241.875 108.525,242.998 106.152 C 245.381 101.115,243.262 96.902,238.933 98.071 M302.400 97.971 C 302.204 98.026,301.606 98.168,301.070 98.286 C 297.882 98.989,296.097 104.813,298.146 107.829 C 299.190 109.364,302.305 109.808,303.334 108.568 C 304.644 106.989,303.814 97.572,302.400 97.971 M346.914 98.989 C 345.884 99.943,345.674 101.420,345.896 106.122 C 346.022 108.777,346.339 109.156,348.433 109.156 C 350.248 109.156,351.289 108.429,351.289 107.162 C 351.289 106.781,351.544 106.105,351.856 105.659 C 352.493 104.750,352.398 103.020,351.550 100.089 C 350.904 97.854,348.703 97.331,346.914 98.989 M242.203 99.444 C 243.356 100.550,243.639 103.371,242.676 104.170 C 242.388 104.409,242.050 105.152,241.924 105.820 C 241.320 109.042,236.975 109.333,236.159 106.206 C 235.749 104.634,236.523 101.111,237.473 100.226 C 237.885 99.842,238.222 99.386,238.222 99.212 C 238.222 99.039,238.502 98.823,238.844 98.734 C 240.336 98.344,241.258 98.539,242.203 99.444 M269.090 99.467 C 268.931 100.850,266.667 101.175,266.667 99.815 C 266.667 98.711,266.919 98.489,268.172 98.489 C 269.087 98.489,269.190 98.599,269.090 99.467 M302.933 103.099 C 302.933 108.175,302.813 108.444,300.552 108.444 C 298.420 108.444,297.352 103.735,299.065 101.884 C 299.237 101.699,299.379 101.299,299.380 100.996 C 299.383 100.502,302.002 98.509,302.667 98.495 C 302.813 98.491,302.933 100.563,302.933 103.099 M350.296 99.349 C 350.754 100.036,351.019 103.434,350.771 105.422 C 350.470 107.827,349.853 108.518,348.134 108.374 L 346.844 108.267 346.744 104.450 L 346.643 100.634 347.798 99.602 C 348.913 98.605,349.745 98.521,350.296 99.349 M265.867 105.628 C 264.825 106.235,265.001 109.335,266.119 110.068 C 267.103 110.712,268.831 110.509,269.530 109.666 C 269.763 109.385,270.163 109.156,270.420 109.156 C 271.194 109.156,271.398 107.776,270.766 106.811 C 269.832 105.385,267.324 104.780,265.867 105.628 M125.526 107.405 C 125.713 107.755,125.867 108.504,125.867 109.069 C 125.867 109.956,126.046 110.142,127.173 110.426 C 128.550 110.773,128.885 111.175,128.415 111.915 C 127.945 112.657,125.961 112.067,125.722 111.115 C 125.610 110.671,125.220 110.229,124.854 110.133 C 124.488 110.038,124.074 109.499,123.934 108.935 C 123.793 108.372,123.428 107.634,123.123 107.296 C 122.679 106.802,122.655 106.575,123.006 106.153 C 123.513 105.542,124.896 106.229,125.526 107.405 M269.757 107.245 L 270.536 108.080 269.046 108.746 C 267.211 109.566,266.100 108.978,266.497 107.397 C 266.917 105.724,268.279 105.661,269.757 107.245 M375.031 108.423 C 373.451 110.836,373.396 112.472,374.863 113.378 C 377.426 114.963,378.831 114.267,379.233 111.214 C 379.747 107.319,376.964 105.471,375.031 108.423 M377.884 108.516 C 378.119 108.750,378.311 109.870,378.311 111.004 L 378.311 113.067 377.058 113.067 C 375.151 113.067,374.675 110.798,376.068 108.356 C 376.303 107.943,377.409 108.040,377.884 108.516 M156.178 111.697 C 155.874 112.861,154.013 113.778,152.000 113.756 C 146.983 113.702,145.477 112.348,149.986 111.945 C 151.864 111.777,152.809 111.514,153.363 111.003 C 154.885 109.601,156.615 110.027,156.178 111.697 M252.998 111.012 C 252.694 111.447,252.444 112.022,252.444 112.290 C 252.444 112.558,252.124 113.184,251.733 113.681 C 250.516 115.228,250.901 120.178,252.239 120.178 C 254.738 120.178,257.532 114.143,256.395 111.200 C 255.896 109.907,253.852 109.794,252.998 111.012 M255.789 112.436 C 256.034 113.130,255.928 113.698,255.344 114.818 C 254.923 115.627,254.578 116.493,254.578 116.743 C 254.578 118.212,252.301 119.244,251.872 117.970 C 251.488 116.830,251.634 116.184,252.819 113.796 C 254.169 111.075,255.149 110.626,255.789 112.436 M125.697 113.102 C 125.980 114.392,125.345 115.363,124.791 114.486 C 124.401 113.869,124.338 112.580,124.681 112.237 C 125.155 111.763,125.460 112.022,125.697 113.102 M131.677 114.276 C 133.661 116.150,133.686 116.267,132.096 116.267 C 131.082 116.267,130.819 116.111,130.641 115.404 C 130.522 114.929,130.119 114.265,129.746 113.927 C 129.372 113.589,129.067 113.177,129.067 113.012 C 129.067 112.302,130.136 112.820,131.677 114.276 M128.287 116.142 C 128.347 116.562,128.682 116.980,129.033 117.072 C 129.751 117.260,130.251 118.641,129.720 118.969 C 129.530 119.086,129.286 118.847,129.179 118.436 C 129.072 118.025,128.830 117.689,128.642 117.689 C 128.263 117.689,126.222 115.743,126.222 115.382 C 126.222 114.720,128.187 115.443,128.287 116.142 M141.689 115.540 L 142.756 115.796 141.778 116.070 C 140.665 116.381,139.022 116.071,139.022 115.549 C 139.022 115.159,140.084 115.155,141.689 115.540 M145.778 116.601 C 145.778 118.211,146.757 118.368,147.319 116.848 C 147.532 116.272,147.823 116.213,149.531 116.399 C 154.207 116.909,154.597 118.789,150.532 121.226 C 149.652 121.753,149.455 122.076,149.588 122.770 C 149.736 123.546,149.652 123.628,148.861 123.476 C 148.144 123.339,147.859 123.514,147.423 124.358 C 146.977 125.220,146.585 125.450,145.255 125.632 C 144.363 125.755,143.195 126.072,142.661 126.338 C 142.126 126.603,141.314 126.724,140.855 126.607 L 140.021 126.394 140.753 125.732 L 141.484 125.070 140.698 124.425 C 140.010 123.860,139.969 123.685,140.372 123.023 C 141.026 121.952,140.615 121.047,139.280 120.619 L 138.133 120.250 139.446 120.214 C 140.167 120.194,140.857 120.018,140.978 119.822 C 141.099 119.627,141.788 119.464,142.510 119.462 C 145.249 119.452,146.213 118.745,144.533 117.980 C 143.056 117.306,143.355 115.556,144.948 115.556 C 145.629 115.556,145.778 115.743,145.778 116.601 M154.382 115.982 C 154.050 116.314,153.861 116.314,153.529 115.982 C 153.197 115.650,153.292 115.556,153.956 115.556 C 154.619 115.556,154.714 115.650,154.382 115.982 M134.578 117.689 C 134.406 117.967,134.201 117.988,133.964 117.751 C 133.769 117.555,133.725 117.207,133.867 116.978 C 134.039 116.699,134.243 116.679,134.480 116.916 C 134.676 117.111,134.720 117.459,134.578 117.689 M137.570 118.983 C 137.652 119.054,137.212 119.111,136.593 119.111 C 135.973 119.111,135.467 118.948,135.467 118.749 C 135.467 118.430,137.146 118.617,137.570 118.983 M102.059 259.459 C 100.377 259.579,99.894 259.797,98.448 261.088 C 95.408 263.801,94.726 264.144,92.774 263.941 C 91.202 263.777,91.196 263.781,88.211 266.805 C 86.459 268.581,84.824 269.922,84.261 270.046 C 81.993 270.544,80.260 273.327,81.467 274.533 C 82.318 275.385,82.071 276.504,80.915 277.031 C 80.099 277.403,78.031 280.646,77.655 282.144 C 77.436 283.013,78.945 283.726,81.012 283.731 C 81.470 283.732,82.270 284.024,82.790 284.380 C 83.309 284.736,84.453 285.231,85.333 285.482 C 87.743 286.168,90.793 288.163,92.552 290.206 C 94.047 291.941,94.235 292.044,96.395 292.317 C 101.238 292.927,102.403 292.115,103.099 287.644 C 103.297 286.373,103.629 284.773,103.837 284.089 C 104.050 283.390,104.203 280.086,104.186 276.548 C 104.160 271.273,104.275 269.784,104.892 267.364 C 105.389 265.419,105.596 263.642,105.526 261.926 C 105.409 259.060,105.612 259.204,102.059 259.459 ");
				attr(path4, "stroke", "none");
				attr(path4, "fill", "#aa8a88");
				attr(path4, "fill-rule", "evenodd");
				add_location(path4, file$7, 9, 245090, 245265);
				attr(g0, "id", "svgg");
				add_location(g0, file$7, 9, 156, 331);
				attr(svg, "id", "svg");
				attr(svg, "xmlns", "http://www.w3.org/2000/svg");
				attr(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
				attr(svg, "width", "80");
				attr(svg, "height", "70");
				attr(svg, "viewBox", "0, 0, 400,355.55555555555554");
				add_location(svg, file$7, 9, 2, 177);
				attr(g1, "transform", g1_transform_value = `translate(${ctx.enemy.x}, ${ctx.enemy.y})`);
				add_location(g1, file$7, 6, 0, 84);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, g1, anchor);
				append(g1, svg);
				append(svg, g0);
				append(g0, path0);
				append(g0, path1);
				append(g0, path2);
				append(g0, path3);
				append(g0, path4);
				current = true;
			},

			p: function update(changed, ctx) {
				if ((!current || changed.enemy) && g1_transform_value !== (g1_transform_value = `translate(${ctx.enemy.x}, ${ctx.enemy.y})`)) {
					attr(g1, "transform", g1_transform_value);
				}
			},

			i: function intro(local) {
				if (current) return;
				if (g1_outro) g1_outro.end(1);

				current = true;
			},

			o: function outro(local) {
				if (local) {
					g1_outro = create_out_transition(g1, fly, { y: -5, duration: 200 });
				}

				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(g1);
					if (g1_outro) g1_outro.end();
				}
			}
		};
	}

	function instance$4($$self, $$props, $$invalidate) {
		let { enemy } = $$props;

		$$self.$set = $$props => {
			if ('enemy' in $$props) $$invalidate('enemy', enemy = $$props.enemy);
		};

		return { enemy };
	}

	class Enemy extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$4, create_fragment$7, safe_not_equal, ["enemy"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.enemy === undefined && !('enemy' in props)) {
				console.warn("<Enemy> was created without expected prop 'enemy'");
			}
		}

		get enemy() {
			throw new Error("<Enemy>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set enemy(value) {
			throw new Error("<Enemy>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	/* src/components/Bullet.svelte generated by Svelte v3.4.1 */

	const file$8 = "src/components/Bullet.svelte";

	function create_fragment$8(ctx) {
		var g, rect, g_transform_value;

		return {
			c: function create() {
				g = svg_element("g");
				rect = svg_element("rect");
				attr(rect, "width", "5");
				attr(rect, "height", "5000");
				attr(rect, "fill", "#ff0000");
				add_location(rect, file$8, 5, 2, 121);
				attr(g, "transform", g_transform_value = `translate(${ctx.bullet.x}, ${ctx.bullet.y}) rotate(${ctx.bullet.angle})`);
				add_location(g, file$8, 4, 0, 41);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, g, anchor);
				append(g, rect);
			},

			p: function update(changed, ctx) {
				if ((changed.bullet) && g_transform_value !== (g_transform_value = `translate(${ctx.bullet.x}, ${ctx.bullet.y}) rotate(${ctx.bullet.angle})`)) {
					attr(g, "transform", g_transform_value);
				}
			},

			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(g);
				}
			}
		};
	}

	function instance$5($$self, $$props, $$invalidate) {
		let { bullet } = $$props;

		$$self.$set = $$props => {
			if ('bullet' in $$props) $$invalidate('bullet', bullet = $$props.bullet);
		};

		return { bullet };
	}

	class Bullet$1 extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$5, create_fragment$8, safe_not_equal, ["bullet"]);

			const { ctx } = this.$$;
			const props = options.props || {};
			if (ctx.bullet === undefined && !('bullet' in props)) {
				console.warn("<Bullet> was created without expected prop 'bullet'");
			}
		}

		get bullet() {
			throw new Error("<Bullet>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}

		set bullet(value) {
			throw new Error("<Bullet>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
		}
	}

	const isPlaying = writable(false);
	const score = writable(0);
	const maxScoreFromLocalStorage = localStorage.getItem('maxScore') || 0;

	const maxScore = writable(maxScoreFromLocalStorage);

	/* src/components/Score.svelte generated by Svelte v3.4.1 */

	const file$9 = "src/components/Score.svelte";

	function create_fragment$9(ctx) {
		var div, t0, t1;

		return {
			c: function create() {
				div = element("div");
				t0 = text("Score: ");
				t1 = text(ctx.$score);
				div.className = "score svelte-i9b0y5";
				add_location(div, file$9, 12, 0, 147);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, t0);
				append(div, t1);
			},

			p: function update(changed, ctx) {
				if (changed.$score) {
					set_data(t1, ctx.$score);
				}
			},

			i: noop,
			o: noop,

			d: function destroy(detaching) {
				if (detaching) {
					detach(div);
				}
			}
		};
	}

	function instance$6($$self, $$props, $$invalidate) {
		let $score;

		validate_store(score, 'score');
		subscribe($$self, score, $$value => { $score = $$value; $$invalidate('$score', $score); });

		return { $score };
	}

	class Score extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$6, create_fragment$9, safe_not_equal, []);
		}
	}

	const enemyList = writable([]);
	const enemySpeed = writable(0.5);
	const lastEnemyAddedAt = writable(0);
	const enemyInterval = writable(3000);

	/* src/components/GameField.svelte generated by Svelte v3.4.1 */

	const file$a = "src/components/GameField.svelte";

	function get_each_context(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.bullet = list[i];
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		const child_ctx = Object.create(ctx);
		child_ctx.enemy = list[i];
		return child_ctx;
	}

	// (22:4) {#each $enemyList as enemy (enemy.id)}
	function create_each_block_1(key_1, ctx) {
		var first, current;

		var enemy = new Enemy({
			props: { enemy: ctx.enemy },
			$$inline: true
		});

		return {
			key: key_1,

			first: null,

			c: function create() {
				first = empty();
				enemy.$$.fragment.c();
				this.first = first;
			},

			m: function mount(target, anchor) {
				insert(target, first, anchor);
				mount_component(enemy, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var enemy_changes = {};
				if (changed.$enemyList) enemy_changes.enemy = ctx.enemy;
				enemy.$set(enemy_changes);
			},

			i: function intro(local) {
				if (current) return;
				enemy.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				enemy.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(first);
				}

				enemy.$destroy(detaching);
			}
		};
	}

	// (25:4) {#each $bulletList as bullet (bullet.id)}
	function create_each_block(key_1, ctx) {
		var first, current;

		var bullet = new Bullet$1({
			props: { bullet: ctx.bullet },
			$$inline: true
		});

		return {
			key: key_1,

			first: null,

			c: function create() {
				first = empty();
				bullet.$$.fragment.c();
				this.first = first;
			},

			m: function mount(target, anchor) {
				insert(target, first, anchor);
				mount_component(bullet, target, anchor);
				current = true;
			},

			p: function update(changed, ctx) {
				var bullet_changes = {};
				if (changed.$bulletList) bullet_changes.bullet = ctx.bullet;
				bullet.$set(bullet_changes);
			},

			i: function intro(local) {
				if (current) return;
				bullet.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				bullet.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(first);
				}

				bullet.$destroy(detaching);
			}
		};
	}

	function create_fragment$a(ctx) {
		var div, svg, each_blocks_1 = [], each0_lookup = new Map(), each0_anchor, each_blocks = [], each1_lookup = new Map(), each1_anchor, t, current;

		var each_value_1 = ctx.$enemyList;

		const get_key = ctx => ctx.enemy.id;

		for (var i = 0; i < each_value_1.length; i += 1) {
			let child_ctx = get_each_context_1(ctx, each_value_1, i);
			let key = get_key(child_ctx);
			each0_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
		}

		var each_value = ctx.$bulletList;

		const get_key_1 = ctx => ctx.bullet.id;

		for (var i = 0; i < each_value.length; i += 1) {
			let child_ctx = get_each_context(ctx, each_value, i);
			let key = get_key_1(child_ctx);
			each1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
		}

		var cannon = new Cannon({ $$inline: true });

		var score = new Score({ $$inline: true });

		return {
			c: function create() {
				div = element("div");
				svg = svg_element("svg");

				for (i = 0; i < each_blocks_1.length; i += 1) each_blocks_1[i].c();

				each0_anchor = empty();

				for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].c();

				each1_anchor = empty();
				cannon.$$.fragment.c();
				t = space();
				score.$$.fragment.c();
				attr(svg, "viewBox", "0 0 480 800");
				add_location(svg, file$a, 20, 2, 455);
				div.className = "container svelte-1a0dmdb";
				add_location(div, file$a, 19, 0, 429);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, svg);

				for (i = 0; i < each_blocks_1.length; i += 1) each_blocks_1[i].m(svg, null);

				append(svg, each0_anchor);

				for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].m(svg, null);

				append(svg, each1_anchor);
				mount_component(cannon, svg, null);
				append(div, t);
				mount_component(score, div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				const each_value_1 = ctx.$enemyList;

				group_outros();
				each_blocks_1 = update_keyed_each(each_blocks_1, changed, get_key, 1, ctx, each_value_1, each0_lookup, svg, outro_and_destroy_block, create_each_block_1, each0_anchor, get_each_context_1);
				check_outros();

				const each_value = ctx.$bulletList;

				group_outros();
				each_blocks = update_keyed_each(each_blocks, changed, get_key_1, 1, ctx, each_value, each1_lookup, svg, outro_and_destroy_block, create_each_block, each1_anchor, get_each_context);
				check_outros();
			},

			i: function intro(local) {
				if (current) return;
				for (var i = 0; i < each_value_1.length; i += 1) each_blocks_1[i].i();

				for (var i = 0; i < each_value.length; i += 1) each_blocks[i].i();

				cannon.$$.fragment.i(local);

				score.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				for (i = 0; i < each_blocks_1.length; i += 1) each_blocks_1[i].o();

				for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].o();

				cannon.$$.fragment.o(local);
				score.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(div);
				}

				for (i = 0; i < each_blocks_1.length; i += 1) each_blocks_1[i].d();

				for (i = 0; i < each_blocks.length; i += 1) each_blocks[i].d();

				cannon.$destroy();

				score.$destroy();
			}
		};
	}

	function instance$7($$self, $$props, $$invalidate) {
		let $enemyList, $bulletList;

		validate_store(enemyList, 'enemyList');
		subscribe($$self, enemyList, $$value => { $enemyList = $$value; $$invalidate('$enemyList', $enemyList); });
		validate_store(bulletList, 'bulletList');
		subscribe($$self, bulletList, $$value => { $bulletList = $$value; $$invalidate('$bulletList', $bulletList); });

		return { $enemyList, $bulletList };
	}

	class GameField extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$7, create_fragment$a, safe_not_equal, []);
		}
	}

	function rotateCannon() {
	  const currentAngle = get(angle);
	  switch (get(direction)) {
	    case 'left':
	      if (currentAngle > -45) angle.update(a => a - 0.4);
	      break;
	    case 'right':
	      if (currentAngle < 45) angle.update(a => a + 0.4);
	      break;
	    default:
	      break;
	  }
	}

	function shoot() {
	  if (get(isFiring) && Date.now() - get(lastFireAt) > 800) {
	    lastFireAt.set(Date.now());
	    bulletList.update(bullets => [
	      ...bullets,
	      {
	        x: 238,
	        y: 760,
	        angle: get(angle),
	        id: () => Math.random() + Date.now(),
	      },
	    ]);
	  }
	}

	function moveBullet() {
	  bulletList.update(bullets =>
	    bullets.map(bullet => ({
	      ...bullet,
	      y: bullet.y - 20,
	      x: (780 - bullet.y) * Math.tan((bullet.angle * Math.PI) / 180) + 238,
	    })),
	  );
	}

	function clearBullets() {
	  bulletList.update(bullets => bullets.filter(bullet => bullet.y > 0));
	}

	function removeBullet(id) {
	  bulletList.update(bullets => bullets.filter(bullet => bullet.id !== id));
	}

	function addEnemy() {
	  if (Date.now() - get(lastEnemyAddedAt) > get(enemyInterval)) {
	    lastEnemyAddedAt.set(Date.now());
	    enemyList.update(enemies => [
	      ...enemies,
	      {
	        x: Math.floor(Math.random() * 449) + 1,
	        y: 0,
	        id: () => Math.random() + Date.now(),
	        speed: get(enemySpeed),
	      },
	    ]);
	  }
	}

	function moveEnemy() {
	  enemyList.update(enemyList =>
	    enemyList.map(enemy => ({
	      ...enemy,
	      y: enemy.y + enemy.speed,
	    })),
	  );
	}

	function removeEnemy(id) {
	  enemyList.update(enemies => enemies.filter(enemy => enemy.id !== id));
	}

	const enemyWidth = 30;
	const bulletWidth = 5;
	const enemyHeight = 30;
	const bulletHeight = 8;

	function checkCollision() {
	  get(bulletList).forEach(bullet => {
	    get(enemyList).forEach(enemy => {
	      if (
	        bullet.x < enemy.x + enemyWidth &&
	        bullet.x + bulletWidth > enemy.x &&
	        bullet.y < enemy.y + enemyHeight &&
	        bullet.y + bulletHeight > enemy.y
	      ) {
	        removeBullet(bullet.id);
	        removeEnemy(enemy.id);
	        score.update(val => val + 1);
	        Math.random() > 0.3
	          ? enemyInterval.update(value => (value > 500 ? value - 50 : value))
	          : enemySpeed.update(value => value + 0.05);
	      }
	    });
	  });
	}

	function enemyAttack() {
	  if (get(enemyList).find(({ y }) => y > 780)) {
	    gameOver();
	  }
	}

	function gameOver() {
	  enemyList.set([]);
	  bulletList.set([]);
	  enemySpeed.set(0.5);
	  enemyInterval.set(3000);
	  isPlaying.set(false);
	  const currentScore = get(score);
	  if (currentScore > get(maxScore)) {
	    maxScore.set(currentScore);
	    localStorage.setItem('maxScore', currentScore);
	  }
	}

	function startLoop(steps) {
	  window.requestAnimationFrame(() => {
	    steps.forEach(step => {
	      if (typeof step === 'function') step();
	    });
	    if (get(isPlaying)) startLoop(steps);
	  });
	}

	const startGame = () => {
	  isPlaying.set(true);
	  score.set(0);
	  startLoop([
	    rotateCannon,
	    shoot,
	    addEnemy,
	    moveEnemy,
	    enemyAttack,
	    moveBullet,
	    checkCollision,
	    clearBullets,
	  ]);
	};

	/* src/components/Modal.svelte generated by Svelte v3.4.1 */

	const file$b = "src/components/Modal.svelte";

	// (46:4) {#if $isPlaying === false}
	function create_if_block_1(ctx) {
		var div;

		return {
			c: function create() {
				div = element("div");
				div.textContent = "Game Over";
				div.className = "message svelte-1ttd451";
				add_location(div, file$b, 46, 6, 946);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(div);
				}
			}
		};
	}

	// (49:4) {#if $score > 0}
	function create_if_block(ctx) {
		var div, t0, t1;

		return {
			c: function create() {
				div = element("div");
				t0 = text("Your score: ");
				t1 = text(ctx.$score);
				div.className = "message svelte-1ttd451";
				add_location(div, file$b, 49, 6, 1020);
			},

			m: function mount(target, anchor) {
				insert(target, div, anchor);
				append(div, t0);
				append(div, t1);
			},

			p: function update(changed, ctx) {
				if (changed.$score) {
					set_data(t1, ctx.$score);
				}
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(div);
				}
			}
		};
	}

	function create_fragment$b(ctx) {
		var div3, div2, t0, t1, div0, t2, t3, t4, div1, t5, t6_value = ctx.$isPlaying === false ? ' AGAIN' : '', t6, div3_transition, current, dispose;

		var if_block0 = (ctx.$isPlaying === false) && create_if_block_1(ctx);

		var if_block1 = (ctx.$score > 0) && create_if_block(ctx);

		return {
			c: function create() {
				div3 = element("div");
				div2 = element("div");
				if (if_block0) if_block0.c();
				t0 = space();
				if (if_block1) if_block1.c();
				t1 = space();
				div0 = element("div");
				t2 = text("Your record: ");
				t3 = text(ctx.$maxScore);
				t4 = space();
				div1 = element("div");
				t5 = text("PLAY");
				t6 = text(t6_value);
				div0.className = "message svelte-1ttd451";
				add_location(div0, file$b, 51, 4, 1082);
				div1.className = "button svelte-1ttd451";
				add_location(div1, file$b, 52, 4, 1138);
				div2.className = "modal svelte-1ttd451";
				add_location(div2, file$b, 44, 2, 889);
				div3.className = "overlay svelte-1ttd451";
				add_location(div3, file$b, 43, 0, 849);
				dispose = listen(div1, "click", startGame);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				insert(target, div3, anchor);
				append(div3, div2);
				if (if_block0) if_block0.m(div2, null);
				append(div2, t0);
				if (if_block1) if_block1.m(div2, null);
				append(div2, t1);
				append(div2, div0);
				append(div0, t2);
				append(div0, t3);
				append(div2, t4);
				append(div2, div1);
				append(div1, t5);
				append(div1, t6);
				current = true;
			},

			p: function update(changed, ctx) {
				if (ctx.$isPlaying === false) {
					if (!if_block0) {
						if_block0 = create_if_block_1(ctx);
						if_block0.c();
						if_block0.m(div2, t0);
					}
				} else if (if_block0) {
					if_block0.d(1);
					if_block0 = null;
				}

				if (ctx.$score > 0) {
					if (if_block1) {
						if_block1.p(changed, ctx);
					} else {
						if_block1 = create_if_block(ctx);
						if_block1.c();
						if_block1.m(div2, t1);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if (!current || changed.$maxScore) {
					set_data(t3, ctx.$maxScore);
				}

				if ((!current || changed.$isPlaying) && t6_value !== (t6_value = ctx.$isPlaying === false ? ' AGAIN' : '')) {
					set_data(t6, t6_value);
				}
			},

			i: function intro(local) {
				if (current) return;
				add_render_callback(() => {
					if (!div3_transition) div3_transition = create_bidirectional_transition(div3, fade, {}, true);
					div3_transition.run(1);
				});

				current = true;
			},

			o: function outro(local) {
				if (!div3_transition) div3_transition = create_bidirectional_transition(div3, fade, {}, false);
				div3_transition.run(0);

				current = false;
			},

			d: function destroy(detaching) {
				if (detaching) {
					detach(div3);
				}

				if (if_block0) if_block0.d();
				if (if_block1) if_block1.d();

				if (detaching) {
					if (div3_transition) div3_transition.end();
				}

				dispose();
			}
		};
	}

	function instance$8($$self, $$props, $$invalidate) {
		let $isPlaying, $score, $maxScore;

		validate_store(isPlaying, 'isPlaying');
		subscribe($$self, isPlaying, $$value => { $isPlaying = $$value; $$invalidate('$isPlaying', $isPlaying); });
		validate_store(score, 'score');
		subscribe($$self, score, $$value => { $score = $$value; $$invalidate('$score', $score); });
		validate_store(maxScore, 'maxScore');
		subscribe($$self, maxScore, $$value => { $maxScore = $$value; $$invalidate('$maxScore', $maxScore); });

		return { $isPlaying, $score, $maxScore };
	}

	class Modal extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$8, create_fragment$b, safe_not_equal, []);
		}
	}

	/* src/App.svelte generated by Svelte v3.4.1 */

	const file$c = "src/App.svelte";

	// (28:2) {#if !$isPlaying}
	function create_if_block$1(ctx) {
		var current;

		var modal = new Modal({ $$inline: true });

		return {
			c: function create() {
				modal.$$.fragment.c();
			},

			m: function mount(target, anchor) {
				mount_component(modal, target, anchor);
				current = true;
			},

			i: function intro(local) {
				if (current) return;
				modal.$$.fragment.i(local);

				current = true;
			},

			o: function outro(local) {
				modal.$$.fragment.o(local);
				current = false;
			},

			d: function destroy(detaching) {
				modal.$destroy(detaching);
			}
		};
	}

	function create_fragment$c(ctx) {
		var t0, t1, t2, div, current;

		var gamefield = new GameField({ $$inline: true });

		var fpsmonitor = new FpsMonitor({ $$inline: true });

		var controls = new Controls({ $$inline: true });

		var if_block = (!ctx.$isPlaying) && create_if_block$1(ctx);

		return {
			c: function create() {
				gamefield.$$.fragment.c();
				t0 = space();
				fpsmonitor.$$.fragment.c();
				t1 = space();
				controls.$$.fragment.c();
				t2 = space();
				div = element("div");
				if (if_block) if_block.c();
				add_location(div, file$c, 26, 0, 673);
			},

			l: function claim(nodes) {
				throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
			},

			m: function mount(target, anchor) {
				mount_component(gamefield, target, anchor);
				insert(target, t0, anchor);
				mount_component(fpsmonitor, target, anchor);
				insert(target, t1, anchor);
				mount_component(controls, target, anchor);
				insert(target, t2, anchor);
				insert(target, div, anchor);
				if (if_block) if_block.m(div, null);
				current = true;
			},

			p: function update(changed, ctx) {
				if (!ctx.$isPlaying) {
					if (!if_block) {
						if_block = create_if_block$1(ctx);
						if_block.c();
						if_block.i(1);
						if_block.m(div, null);
					} else {
										if_block.i(1);
					}
				} else if (if_block) {
					group_outros();
					on_outro(() => {
						if_block.d(1);
						if_block = null;
					});

					if_block.o(1);
					check_outros();
				}
			},

			i: function intro(local) {
				if (current) return;
				gamefield.$$.fragment.i(local);

				fpsmonitor.$$.fragment.i(local);

				controls.$$.fragment.i(local);

				if (if_block) if_block.i();
				current = true;
			},

			o: function outro(local) {
				gamefield.$$.fragment.o(local);
				fpsmonitor.$$.fragment.o(local);
				controls.$$.fragment.o(local);
				if (if_block) if_block.o();
				current = false;
			},

			d: function destroy(detaching) {
				gamefield.$destroy(detaching);

				if (detaching) {
					detach(t0);
				}

				fpsmonitor.$destroy(detaching);

				if (detaching) {
					detach(t1);
				}

				controls.$destroy(detaching);

				if (detaching) {
					detach(t2);
					detach(div);
				}

				if (if_block) if_block.d();
			}
		};
	}

	function instance$9($$self, $$props, $$invalidate) {
		let $isPlaying;

		validate_store(isPlaying, 'isPlaying');
		subscribe($$self, isPlaying, $$value => { $isPlaying = $$value; $$invalidate('$isPlaying', $isPlaying); });

		return { $isPlaying };
	}

	class App extends SvelteComponentDev {
		constructor(options) {
			super(options);
			init(this, options, instance$9, create_fragment$c, safe_not_equal, []);
		}
	}

	const app = new App({
		target: document.body,
		props: {
			name: 'world'
		}
	});

	return app;

}());
//# sourceMappingURL=bundle.js.map
