require('dotenv').config();

const express = require('express');
const { WebClient } = require('@slack/web-api');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// 環境変数の設定
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// クライアントの初期化
const client = new WebClient(SLACK_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Expressサーバーのセットアップ
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ボタンが押されたときの処理
app.post('/slack/actions', async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload); // Slackのpayloadを解析
    const action = payload.actions[0].action_id;
    const userId = payload.user.id; // SlackのユーザーID
    const userName = payload.user.name;
    const ymd = new Date().toISOString().split('T')[0]; // 今日の日付

    let workMode = null;
    if (action === 'button_office') workMode = 'office';
    if (action === 'button_remote') workMode = 'remote';

    // Supabaseにデータを保存/更新
    const { data: existingRecord, error: fetchError } = await supabase
      .from('record_table')
      .select('*')
      .eq('ymd', ymd)
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existingRecord) {
      // 既存のレコードがある場合、キャンセルか変更
      if (existingRecord.work_mode === workMode) {
        // 同じボタンを押した場合 -> キャンセル
        await supabase
          .from('record_table')
          .update({ work_mode: null })
          .eq('id', existingRecord.id);
        workMode = null;
      } else {
        // 別のボタンを押した場合 -> 更新
        await supabase
          .from('record_table')
          .update({ work_mode })
          .eq('id', existingRecord.id);
      }
    } else {
      // 初回選択時 -> 新規作成
      await supabase
        .from('record_table')
        .insert([{ ymd, user_id: userId, work_mode: workMode }]);
    }

    // 現在の人数を集計
    const { data: countData, error: countError } = await supabase
      .from('record_table')
      .select('work_mode, count(*)', { count: 'exact' })
      .eq('ymd', ymd)
      .group('work_mode');

    if (countError) throw countError;

    const officeCount =
      countData.find((d) => d.work_mode === 'office')?.count || 0;
    const remoteCount =
      countData.find((d) => d.work_mode === 'remote')?.count || 0;

    // ボタンの状態を更新
    await client.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: '勤務場所を選択してください:',
      blocks: [
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: `本社勤務 (${officeCount})`,
              },
              action_id: 'button_office',
              style: workMode === 'office' ? 'primary' : undefined,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: `在宅勤務 (${remoteCount})`,
              },
              action_id: 'button_remote',
              style: workMode === 'remote' ? 'primary' : undefined,
            },
          ],
        },
      ],
    });

    res.status(200).send();
  } catch (error) {
    console.error('Error handling action:', error);
    res.status(500).send('Internal Server Error');
  }
});

// サーバーを起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
