const express = require('express');
const { WebClient } = require('@slack/web-api');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// 環境変数の設定
const SLACK_TOKEN = process.env.SLACK_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // anon key

// クライアントの初期化
const client = new WebClient(SLACK_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); // anon keyを使用

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
    const userId = payload.user?.name;
    const ymd = new Date().toISOString().split('T')[0]; // 今日の日付

    let workStyle = null;
    if (action === 'button_office') workStyle = 'office';
    if (action === 'button_remote') workStyle = 'remote';

    // Supabaseにデータを保存/更新
    const { data: existingRecord, error: fetchError } = await supabase
      .from('Record')
      .select('*')
      .eq('ymd', ymd)
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (existingRecord) {
      // 既存のレコードがある場合、キャンセルか変更
      if (existingRecord.workStyle === workStyle) {
        // 同じボタンを押した場合 -> キャンセル
        await supabase
          .from('Record')
          .update({ work_mode: null })
          .eq('id', existingRecord.id);
        workStyle = null;
      } else {
        // 別のボタンを押した場合 -> 更新
        await supabase
          .from('Record')
          .update({ workStyle })
          .eq('id', existingRecord.id);
      }
    } else {
      // 初回選択時 -> 新規作成
      await supabase
        .from('Record')
        .insert([{ ymd, user_id: userId, workStyle: workMode }]);
    }

    // 現在の人数を集計
    const { data: countData, error: countError } = await supabase
      .from('Record')
      .select('workStyle, count(*)')
      .eq('ymd', ymd)
      .groupBy('workStyle'); // 'groupBy'を使用

    if (countError) throw countError;

    // 各勤務場所の人数を取得
    const officeCount =
      countData.find((d) => d.workStyle === 'office')?.count || 0;
    const remoteCount =
      countData.find((d) => d.workStyle === 'remote')?.count || 0;

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
