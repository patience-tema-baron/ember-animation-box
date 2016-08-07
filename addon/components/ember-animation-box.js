import Ember from 'ember';
import layout from '../templates/components/ember-animation-box';
import { task, timeout } from 'ember-concurrency';

const {
  Component,
  K,
  computed,
  get,
  getOwner,
  getProperties,
  isNone,
  isPresent,
  set,
  typeOf
} = Ember;

const { RSVP: { resolve } } = Ember;

const activeInstanceClass = 'ember-animation-box-active-instance';

export default Component.extend({
  layout,
  hook: 'ember_animation_box',

  isInstant: false,
  resolve: K,
  transitionIn: K,
  transitions: [],

  _transitionQueue: [],

  animator: computed('animationAdapter', {
    get() {
      const adapter = get(this, 'animationAdapter') || 'jquery';

      return getOwner(this).lookup(`eab-animation-adapter:${adapter}`);
    }
  }),

  didReceiveAttrs(...args) {
    this._super(...args);
    this._queueTransitions();

    get(this, '_mainQueueTask').perform();
  },

  _queueTransitions() {
    const queue = get(this, '_transitionQueue');

    get(this, 'transitions').forEach((transition) => queue.push(transition));

    Reflect.deleteProperty(this, 'transitions');
  },

  _mainQueueTask: task(function * () {
    yield get(this, '_queueTask').perform('main', get(this, '_transitionQueue'));

    get(this, 'resolve')();
  }).keepLatest(),

  _queueTask: task(function * (queueName, queue) {
    while (queue.length > 0) {
      yield this._executeNextTransition(queueName, queue);
    }
  }),

  _executeNextTransition(parentQueueName, queue) {
    const queueName = get(queue[0], 'queue');

    if (queueName === parentQueueName || isNone(queueName)) {
      return this._transitionSwitch(queue.shift());
    } else {
      this._startParallelQueue(queueName, queue);

      return resolve();
    }
  },

  _startParallelQueue(queueName, queue) {
    const exitTransition = queue.find((transition) => get(transition, 'queue') !== queueName);
    const queueLength = isPresent(exitTransition) ? queue.indexOf(exitTransition) : queue.length;

    get(this, '_queueTask').perform(queueName, queue.splice(0, queueLength));
  },

  _transitionSwitch(transition) {
    if (isPresent(get(transition, 'crossFade'))) {
      return this._crossFade(transition);
    } else if (isPresent(get(transition, 'effect'))) {
      return this._animate(transition);
    } else {
      return this._delay(transition);
    }
  },

  _delay(transition) {
    return get(this, 'isInstant') ? resolve() : timeout(get(transition, 'duration'));
  },

  _crossFade(transition) {
    const $active = this.$(`.${activeInstanceClass}`);
    const $clone = $active.clone().removeClass(activeInstanceClass);
    const transitionIn = get(transition, 'crossFade.in');
    const transitionOut = get(transition, 'crossFade.out');

    $clone.css({ position: 'absolute' });
    $active.before($clone);

    this._performAnimation($clone.get(0), transitionOut).then(() => {
      $clone.remove();
    });

    $active.css({ opacity: 0 });

    if (typeOf(this.attrs.transitionIn) === 'function') {
      this.attrs.transitionIn(transitionIn);
    }

    return this._performAnimation(this.$(`.${activeInstanceClass}`).get(0), transitionIn);
  },

  _animate(transition) {
    const selector = get(transition, 'element');
    const element = this.$(isPresent(selector) ? `.${activeInstanceClass} ${selector}` : undefined).get(0);

    return this._performAnimation(element, transition);
  },

  _performAnimation(element, transition) {
    const effect = get(transition, 'effect') || {};
    const options = getProperties(transition, ...Object.keys(transition));

    Reflect.deleteProperty(options, 'queue');
    Reflect.deleteProperty(options, 'element');

    if (get(this, 'isInstant')) {
      set(options, 'duration', 0);
    }

    return get(this, 'animator').animate(element, effect, options);
  }
});
