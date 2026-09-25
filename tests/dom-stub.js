function makeElement(tag) {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: '',
    className: '',
    children: [],
    style: {},
    textContent: '',
    innerHTML: '',
    title: '',
    type: '',
    disabled: false,
    tabIndex: 0,
    src: '',
    value: '',
    checked: false,
    attrs: {},
    listeners: {},
    parentElement: null,
  };

  Object.defineProperty(el, 'innerText', {
    get() {
      return el.textContent || '';
    },
    set(v) {
      el.textContent = v;
    },
    configurable: true,
  });

  el.classList = {
    contains(name) {
      return el.className.split(/\s+/).filter(Boolean).includes(name);
    },
    add(name) {
      if (!el.classList.contains(name)) el.className = `${el.className} ${name}`.trim();
    },
    remove(name) {
      el.className = el.className.split(/\s+/).filter((part) => part && part !== name).join(' ');
    },
  };
  el.append = (...nodes) => {
    for (const node of nodes) {
      if (node && typeof node === 'object') {
        node.parentElement = el;
        el.children.push(node);
      }
    }
  };
  el.appendChild = (node) => {
    if (node && typeof node === 'object') {
      node.parentElement = el;
      el.children.push(node);
    }
    return node;
  };
  el.insertBefore = (node, ref) => {
    if (!node || typeof node !== 'object') return node;
    node.parentElement = el;
    const idx = ref ? el.children.indexOf(ref) : -1;
    if (idx >= 0) el.children.splice(idx, 0, node);
    else el.children.push(node);
    return node;
  };
  el.replaceChildren = (...nodes) => {
    el.children = [];
    el.append(...nodes);
  };
  el.setAttribute = (key, value) => {
    el.attrs[key] = value;
  };
  el.getAttribute = (key) => {
    return el.attrs[key] !== undefined ? el.attrs[key] : el[key];
  };
  el.addEventListener = (type, fn) => {
    el.listeners[type] = fn;
  };
  el.remove = () => {
    el.removed = true;
    if (el.parentElement) {
      el.parentElement.children = el.parentElement.children.filter((c) => c !== el);
    }
  };
  el.closest = (selector) => {
    let cur = el;
    while (cur) {
      if (matchesSelector(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  };
  el.querySelector = (selector) => queryAll(el, selector)[0] || null;
  el.querySelectorAll = (selector) => queryAll(el, selector);
  el.select = () => {};
  return el;
}

function matchesSimple(el, sel) {
  if (!el || typeof el !== 'object' || !el.tagName) return false;
  sel = sel.trim();
  if (!sel) return false;

  const attrMatch = sel.match(/^([a-zA-Z0-9_\-\.]*)\[([a-zA-Z0-9_\-]+)(?:([*^$]?=)(["']?)(.*?)\4)?\]$/);
  if (attrMatch) {
    const [, tagAndClass, attrName, operator, , attrVal] = attrMatch;
    if (tagAndClass && !matchesSimple(el, tagAndClass)) return false;
    const actualVal = el.attrs[attrName] !== undefined ? el.attrs[attrName] : el[attrName];
    if (actualVal === undefined) return false;
    if (!operator) return true;
    if (operator === '=') return String(actualVal) === attrVal;
    if (operator === '*=') return String(actualVal).includes(attrVal);
    if (operator === '^=') return String(actualVal).startsWith(attrVal);
    if (operator === '$=') return String(actualVal).endsWith(attrVal);
    return false;
  }

  if (sel.includes(':checked')) {
    const base = sel.replace(':checked', '');
    if (base && !matchesSimple(el, base)) return false;
    return !!el.checked;
  }

  const parts = sel.split(/(?=[.#])/);
  for (const part of parts) {
    if (part.startsWith('.')) {
      const cls = part.slice(1);
      if (!el.classList.contains(cls)) return false;
    } else if (part.startsWith('#')) {
      const id = part.slice(1);
      if (el.id !== id) return false;
    } else if (part) {
      if (el.tagName.toLowerCase() !== part.toLowerCase()) return false;
    }
  }
  return true;
}

function matchesSelector(el, selector) {
  if (!selector) return false;
  const groups = selector.split(',').map((s) => s.trim());
  for (const group of groups) {
    if (group.includes('>')) {
      const segs = group.split('>').map((s) => s.trim());
      if (matchesSimple(el, segs[segs.length - 1])) {
        let current = el.parentElement;
        let matched = true;
        for (let i = segs.length - 2; i >= 0; i--) {
          if (!current || !matchesSimple(current, segs[i])) {
            matched = false;
            break;
          }
          current = current.parentElement;
        }
        if (matched) return true;
      }
    } else if (group.includes(' ')) {
      const segs = group.split(/\s+/);
      if (matchesSimple(el, segs[segs.length - 1])) {
        let current = el.parentElement;
        let segIdx = segs.length - 2;
        while (current && segIdx >= 0) {
          if (matchesSimple(current, segs[segIdx])) {
            segIdx--;
          }
          current = current.parentElement;
        }
        if (segIdx < 0) return true;
      }
    } else {
      if (matchesSimple(el, group)) return true;
    }
  }
  return false;
}

function queryAll(root, selector) {
  const result = [];
  walk(root, (node) => {
    if (node !== root && matchesSelector(node, selector)) {
      result.push(node);
    }
  });
  return result;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}

export function installDom() {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const body = makeElement('body');
  const document = {
    body,
    cookie: 'session=secret',
    getElementById(id) {
      let found = null;
      walk(body, (node) => {
        if (node.id === id) found = node;
      });
      return found;
    },
    querySelector(selector) {
      return queryAll(body, selector)[0] || null;
    },
    querySelectorAll(selector) {
      return queryAll(body, selector);
    },
    createElement: makeElement,
  };

  globalThis.document = document;
  globalThis.requestAnimationFrame = (fn) => {
    fn();
    return 1;
  };

  return {
    document,
    body,
    restore() {
      globalThis.document = previous.document;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    },
  };
}

export function collectText(root) {
  const parts = [];
  walk(root, (node) => {
    if (node.textContent && (!node.children || node.children.length === 0)) {
      parts.push(node.textContent);
    }
  });
  return parts.join('\n');
}

export function toastItems(root) {
  const items = [];
  walk(root, (node) => {
    if (String(node.className || '').includes('qdh-toast-item')) items.push(node);
  });
  return items;
}

export function iframes(root) {
  const found = [];
  walk(root, (node) => {
    if (node.tagName === 'IFRAME') found.push(node);
  });
  return found;
}
