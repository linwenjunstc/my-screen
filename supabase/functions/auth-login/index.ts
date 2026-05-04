// SEC-03: 服务端登录验证 Edge Function
// 部署命令: cd supabase && supabase functions deploy auth-login
// 部署后 URL: https://rfjrkcclhvuldenpdlye.supabase.co/functions/v1/auth-login

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { name, password } = await req.json()

    if (!name || !password) {
      return new Response(
        JSON.stringify({ error: '账号名和密码不能为空' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 查成员
    const { data: member, error } = await supabaseAdmin
      .from('members')
      .select('id, name, role, color_idx, menu_perms, password, password_hash')
      .eq('name', name)
      .maybeSingle()

    if (error || !member) {
      return new Response(
        JSON.stringify({ error: '账号或密码错误' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 验证密码
    let passwordValid = false
    if (member.password_hash) {
      const { data: verifyResult, error: verifyErr } = await supabaseAdmin
        .rpc('verify_password', { plain: password, hashed: member.password_hash })
      if (!verifyErr) passwordValid = verifyResult === true
    }
    if (!passwordValid && member.password) {
      // 兜底：前端 MD5 比对
      passwordValid = (password === member.password)
      // 懒迁移：升级明文密码为 bcrypt hash
      if (passwordValid) {
        const { data: newHash } = await supabaseAdmin
          .rpc('hash_password', { plain: member.password })
        if (newHash) {
          await supabaseAdmin
            .from('members')
            .update({ password_hash: newHash })
            .eq('id', member.id)
        }
      }
    }

    if (!passwordValid) {
      return new Response(
        JSON.stringify({ error: '账号或密码错误' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 写登录日志
    await supabaseAdmin.from('logs').insert({
      id: 'lg' + Date.now() + Math.random().toString(36).slice(2, 6),
      user_id: member.id,
      user_name: member.name,
      action: '用户登录',
      detail: '',
      created_at: new Date().toISOString(),
    }).catch(() => {})

    // 返回安全的用户信息（不含密码字段）
    const { password: _p, password_hash: _ph, ...safeUser } = member
    return new Response(
      JSON.stringify({ user: safeUser }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: '服务器错误：' + err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
