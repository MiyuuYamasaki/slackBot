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

    // ボタンが押されたメッセージのtextを取得
    const messageText = payload.message.text;
    const ymdMatch = messageText.match(/(\d{4}\/\d{2}\/\d{2})/); // 日付（例: 2024/12/10）を抽出

    console.log(messageText);

    if (!ymdMatch) {
      throw new Error('Date not found in the message text');
    }

    const ymd = ymdMatch[1].replace(/\//g, '-'); // "2024/12/10" -> "2024-12-10" に変換
    console.log('Extracted YMD:', ymd);

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

    if (!existingRecord) {
      // レコードが存在しない場合はINSERT
      const { error: insertError } = await supabase
        .from('Record')
        .insert([{ ymd, user_id: userId, workStyle: workStyle }]);

      if (insertError) throw insertError;
      console.log('Inserted new record for', userId);
    } else {
      // 既存のレコードがあり、workStyleが異なる場合はUPDATE
      if (existingRecord.workStyle !== workStyle) {
        const { error: updateError } = await supabase
          .from('Record')
          .update({ workStyle: workStyle })
          .eq('id', existingRecord.id);

        if (updateError) throw updateError;
        console.log('Updated record for', userId);
      } else {
        // 同じworkStyleの場合は変更なし
        console.log('No change needed, already selected', workStyle);
      }
    }

    // 現在の人数を集計
    const {
      data: countData,
      error: countError,
      count,
    } = await supabase
      .from('Record')
      .select('workStyle', { count: 'exact' })
      .eq('ymd', ymd);

    if (countError) throw countError;

    console.log('countData:', countData);

    // 各勤務場所の人数を集計
    const officeCount = countData.filter(
      (d) => d.workStyle === 'office'
    ).length;
    const remoteCount = countData.filter(
      (d) => d.workStyle === 'remote'
    ).length;

    console.log('officeCount:', officeCount);
    console.log('remoteCount:', remoteCount);

    // ボタンの状態を更新
    await client.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: payload.message.text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: payload.message.text,
          },
        },
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
              style: workStyle === 'office' ? 'primary' : undefined,
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: `在宅勤務 (${remoteCount})`,
              },
              action_id: 'button_remote',
              style: workStyle === 'remote' ? 'primary' : undefined,
            },
          ],
        },
      ],
    });

    // // ボタンの状態を更新
    // await client.chat.update({
    //   channel: payload.channel.id,
    //   ts: payload.message.ts,
    //   text: '勤務場所を選択してください:',
    //   blocks: [
    //     {
    //       type: 'actions',
    //       elements: [
    //         {
    //           type: 'button',
    //           text: {
    //             type: 'plain_text',
    //             text: `本社勤務 (${officeCount})`,
    //           },
    //           action_id: 'button_office',
    //           style: workStyle === 'office' ? 'primary' : undefined,
    //         },
    //         {
    //           type: 'button',
    //           text: {
    //             type: 'plain_text',
    //             text: `在宅勤務 (${remoteCount})`,
    //           },
    //           action_id: 'button_remote',
    //           style: workStyle === 'remote' ? 'primary' : undefined,
    //         },
    //       ],
    //     },
    //   ],
    // });

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
