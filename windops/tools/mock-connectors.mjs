// ⑤ 工具层 · 模拟连接器（CMS/SCADA/EAM/备件/告警）
// 让 Executor 端到端真跑并返回结构化数据；真实环境用同名接口替换即可。
// 确定性：输出由入参哈希派生，无随机，便于测试与复现。
// 对应技术细节第 17 页“工具层高可用”。

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0)
}

// 由种子生成确定性的 [min,max) 数列。
function pseudoSeries(seed, n, min, max) {
  const out = []
  let s = seed || 1
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    out.push(round(min + (s / 0xffffffff) * (max - min)))
  }
  return out
}

export function createMockConnectors({ points } = {}) {
  return {
    get_operating_timeseries: async ({ turbine_id, points: reqPoints = [], window }) => {
      const series = {}
      for (const point of reqPoints) {
        const seed = hash(`${turbine_id}|${point}|${window}`)
        const [min, max] = (points && points[point]) || [20, 26]
        series[point] = pseudoSeries(seed, 12, min, max)
      }
      return { turbine_id, window, dataTime: `${window || 'last_30m'}@mock`, points: series, source: 'mock_cms' }
    },

    query_active_alarms: async ({ turbine_id, window }) => {
      const n = hash(`${turbine_id}|${window}`) % 3
      const alarms = Array.from({ length: n }, (_, i) => ({ code: `A${1000 + i}`, level: i === 0 ? 'critical' : 'warning' }))
      return { turbine_id, window, count: alarms.length, alarms, source: 'mock_alarm' }
    },

    retrieve_sop: async ({ system, component }) => ({
      system,
      component,
      steps: [`按 ${system} SOP 确认停机与安全票`, `检查 ${component}`, '记录测量值并回填工单'],
      source: 'mock_sop',
    }),

    search_work_orders: async ({ turbine_id, system }) => {
      const n = 1 + (hash(`${turbine_id}|${system}`) % 3)
      return {
        turbine_id,
        system,
        orders: Array.from({ length: n }, (_, i) => ({ id: `WO-${hash(`${turbine_id}${system}${i}`) % 100000}`, closed: true })),
        source: 'mock_eam',
      }
    },

    check_spare_parts: async ({ component }) => {
      const stock = hash(component || '') % 5
      return { component, stock, available: stock > 0, source: 'mock_spare' }
    },
  }
}

function round(value) {
  return Math.round(value * 100) / 100
}
