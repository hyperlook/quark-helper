// ==========================================
// React Fiber 深度穿透引擎 (专为 Ant Design React 页面打造)
// ==========================================

export function getReactFiber(dom) {
  if (!dom) return null;
  const key = Object.keys(dom).find(
    (k) =>
      k.startsWith('__reactFiber$') ||
      k.startsWith('__reactInternalInstance$') ||
      k.startsWith('__reactProps$')
  );
  return key ? dom[key] : null;
}

// 从单行或者元素 Fiber 中向上穿透查找文件 record
export function extractRecordFromFiber(fiber) {
  let curr = fiber;
  for (let depth = 0; depth < 20 && curr; depth++) {
    const props = curr.memoizedProps || curr.pendingProps;
    if (props?.record && (props.record.fid || props.record.file_name)) {
      return props.record;
    }
    if (props?.file && (props.file.fid || props.file.file_name)) {
      return props.file;
    }
    if (props?.item && (props.item.fid || props.item.file_name)) {
      return props.item;
    }
    curr = curr.return;
  }
  return null;
}

// 从 Table 组件的 Fiber 中提取当前整个视图的全部文件列表
export function extractTableDataSourceFromFiber(tableDom) {
  if (!tableDom) return [];
  const fiber = getReactFiber(tableDom);
  let curr = fiber;
  for (let depth = 0; depth < 25 && curr; depth++) {
    const props = curr.memoizedProps || curr.pendingProps;
    if (Array.isArray(props?.dataSource) && props.dataSource.length > 0) {
      return props.dataSource;
    }
    if (Array.isArray(props?.data) && props.data.length > 0 && props.data[0]?.fid) {
      return props.data;
    }
    curr = curr.return;
  }
  return [];
}

// 只认显式的 0/1、true/false。缺字段不能当成「确认他人」。
function readExplicitOwner(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return null;
}

function resolveShareOwner(targetProps, domHasOwnerTips) {
  if (domHasOwnerTips) return true;
  const candidates = [
    targetProps?.isOwer,
    targetProps?.isOwner,
    targetProps?.is_owner,
    targetProps?.detailInfo?.is_owner,
    targetProps?.detailInfo?.isOwer,
    targetProps?.detailInfo?.share?.is_owner,
    targetProps?.detailInfo?.share?.isOwer,
  ];
  let sawOther = false;
  for (const value of candidates) {
    const flag = readExplicitOwner(value);
    if (flag === true) return true;
    if (flag === false) sawOther = true;
  }
  return sawOther ? false : null;
}

// 从分享页面根/容器 Fiber 中提取归属与文件列表。
// isOwner 三态：true 确认本人，false 确认他人，null 认不出。
// stoken / pwd_id 只用于定位节点，代转存废除后不再对外返回。
export function extractShareContextFromFiber() {
  const container =
    document.querySelector('#ice-container > div') ||
    document.querySelector('.share-container-cls-name-for-get-dom') ||
    document.querySelector('.share-detail-content') ||
    document.querySelector('.file-list') ||
    document.body;

  const fiber = getReactFiber(container);
  let targetProps = null;

  if (fiber) {
    function walk(f, depth = 0) {
      if (!f || depth > 30) return;
      const p = f.memoizedProps;
      // 优先锁定包含完整 detailInfo 的核心组件节点
      if (p && p.detailInfo) {
        targetProps = p;
        return;
      }
      if (p && p.stoken && !targetProps) {
        targetProps = p;
      }
      walk(f.child, depth + 1);
      walk(f.sibling, depth);
    }
    walk(fiber);
  }

  const domHasOwnerTips = Boolean(
    document.querySelector('.owner-tips, [class*="owner-tips"]') ||
      (document.body && document.body.innerText.includes('该链接为本人发出'))
  );

  if (targetProps) {
    return {
      isOwner: resolveShareOwner(targetProps, domHasOwnerTips),
      fileList: targetProps.detailInfo?.list || [],
    };
  }

  if (domHasOwnerTips) {
    return {
      isOwner: true,
      fileList: [],
    };
  }

  return null;
}
