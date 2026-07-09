/**
 * EdgeOne Pages Cloud Function - 问卷提交代理
 * 接收患者问卷数据 → 写入腾讯文档智能表格
 *
 * 路由: /api/submit (POST)
 * 环境变量: TX_DOC_FILE_ID, TX_DOC_SHEET_ID, TX_CLIENT_ID, TX_ACCESS_TOKEN, TX_OPEN_ID
 */

export function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    // 1. 解析请求体
    const data = await context.request.json();

    // 2. 从环境变量获取配置
    const env = context.env || {};
    const fileId = env.TX_DOC_FILE_ID || process.env.TX_DOC_FILE_ID;
    const sheetId = env.TX_DOC_SHEET_ID || process.env.TX_DOC_SHEET_ID;
    const clientId = env.TX_CLIENT_ID || process.env.TX_CLIENT_ID;
    const accessToken = env.TX_ACCESS_TOKEN || process.env.TX_ACCESS_TOKEN;
    const openId = env.TX_OPEN_ID || process.env.TX_OPEN_ID;

    if (!fileId || !sheetId || !clientId || !accessToken || !openId) {
      return new Response(JSON.stringify({
        success: false,
        docSynced: false,
        error: '服务器环境变量未配置',
      }), { status: 500, headers });
    }

    // 3. 构造记录
    const dxText = (data.diagnostics || [])
      .map(d => d.name + '(' + d.score + '项/' + d.levelLabel + ')')
      .join('; ');
    const testText = (data.tests || []).join('、');
    const answersText = (data.answers || [])
      .map(a => '[' + a.dimension + '] ' + a.questionId.replace('q','') + '. ' + a.question + ': ' + a.answers.join('; '))
      .join('\n');

    const record = {
      addRecords: {
        records: [{
          values: {
            '提交时间': [{ type: 'text', text: new Date(data.submittedAt).toLocaleString('zh-CN') }],
            '姓名': [{ type: 'text', text: (data.patient && data.patient.name) || '未填写' }],
            '性别': [{ type: 'text', text: (data.patient && data.patient.gender) || '未填写' }],
            '年龄': [{ type: 'text', text: String((data.patient && data.patient.age) || '未填写') }],
            'BMI': [{ type: 'text', text: (data.patient && data.patient.bmi) || '' }],
            '腰围': [{ type: 'text', text: (data.patient && data.patient.waist) ? data.patient.waist + 'cm' : '' }],
            '血压': [{ type: 'text', text: (data.patient && data.patient.bp) || '未填写' }],
            '主诉': [{ type: 'text', text: (data.patient && data.patient.chief) || '未填写' }],
            '诊断方向': [{ type: 'text', text: dxText || '暂无' }],
            '推荐检测': [{ type: 'text', text: testText || '暂无' }],
            '问卷详情': [{ type: 'text', text: answersText || '暂无' }],
          }
        }]
      }
    };

    // 4. 调用腾讯文档 API
    const apiUrl = 'https://docs.qq.com/openapi/smartbook/v2/files/' + fileId + '/sheets/' + sheetId;

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Client-Id': clientId,
        'Open-Id': openId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(record),
    });

    const result = await resp.json();

    if (result.ret === 0) {
      const recordID = result.data && result.data.addRecords &&
        result.data.addRecords.records && result.data.addRecords.records[0] &&
        result.data.addRecords.records[0].recordID;
      return new Response(JSON.stringify({
        success: true,
        docSynced: true,
        recordID: recordID,
      }), { status: 200, headers });
    } else {
      return new Response(JSON.stringify({
        success: false,
        docSynced: false,
        error: 'ret=' + result.ret + ' ' + (result.msg || ''),
      }), { status: 200, headers });
    }
  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: e.message,
    }), { status: 500, headers });
  }
}
