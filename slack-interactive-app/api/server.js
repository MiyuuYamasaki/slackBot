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
    const ymdMatch = messageText.match(/(\d{4}\/\d{2}\/\d{2})/);

    if (!ymdMatch) {
      throw new Error('Date not found in the message text');
    }

    const ymd = ymdMatch[1].replace(/\//g, '-'); // "2024/12/10" -> "2024-12-10" に変換

    if (action === 'button_list') {
      // クエリを実行してデータを取得
      const { data: records, error: queryError } = await supabase.rpc(
        'custom_query',
        {
          ymd_param: ymd, // SQLに渡す日付パラメータ
        }
      );

      console.log('ymd_param:' + ymd);
      console.log('Data:', records);

      if (queryError) throw queryError;

      // データを分類
      const officeUsers =
        records
          .filter((record) => record.workStyle === 'office')
          .map((record) => `<@${record.user_name}>`)
          .join('\n') || 'なし';

      const remoteUsers =
        records
          .filter((record) => record.workStyle === 'remote')
          .map((record) => `<@${record.user_name}>`)
          .join('\n') || 'なし';

      const vacationUsers =
        records
          .filter((record) => record.workStyle === null)
          .map((record) => `<@${record.user_name}>`)
          .join('\n') || 'なし';

      // メッセージを構築
      const message = `📋 *${ymdMatch} の勤務状況一覧*\n\n🏢 *本社勤務:*\n${officeUsers}\n\n🏠 *在宅勤務:*\n${remoteUsers}\n\n💤 *休暇(回答無):*\n${vacationUsers}`;
      await client.chat.postEphemeral({
        channel: payload.channel.id,
        user: payload.user.id,
        text: message,
      });
    }

    if (action === 'button_office' || action === 'button_remote') {
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

      // メッセージを更新
      await client.chat.update({
        channel: payload.channel.id,
        ts: payload.message.ts,
        text: messageText, // 元のメッセージを保持
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: messageText,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: `🏢 本社勤務 (${officeCount})`,
                  emoji: true,
                },
                action_id: 'button_office',
                style: workStyle === 'office' ? 'primary' : undefined,
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: `🏠 在宅勤務 (${remoteCount})`,
                  emoji: true,
                },
                action_id: 'button_remote',
                style: workStyle === 'remote' ? 'primary' : undefined,
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: `📋 一覧`,
                  emoji: true,
                },
                action_id: 'button_list',
              },
            ],
          },
        ],
      });
    }

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
