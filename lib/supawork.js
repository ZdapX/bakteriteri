
const axios = require("axios");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

class SupaworkAI {
  constructor() {
    this.baseURL = "https://supawork.ai";
    this.tempMailAPI = "https://api.internal.temp-mail.io/api/v3";
    this.bypassAPI = "https://api.nekolabs.web.id/tools/bypass/cf-turnstile";
    this.siteKey = "0x4AAAAAACBjrLhJyEE6mq1c";
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async generateTempEmail() {
    const rand = Math.random().toString(36).substring(2, 10);
    const name = `ImgApi_${rand}`;
    
    const { data } = await axios.post(
      `${this.tempMailAPI}/email/new`,
      { name, domain: "ozsaip.com" },
      {
        headers: {
          "Content-Type": "application/json",
          "Application-Name": "web",
          "Application-Version": "4.0.0",
          "X-CORS-Header": "iaWg3pchvFx48fY"
        }
      }
    );
    
    return {
      email: data.email,
      password: `ImgApi_${crypto.randomBytes(5).toString("hex")}A1!`
    };
  }

  async bypassCloudflare(url) {
    const { data } = await axios.post(
      this.bypassAPI,
      { url, siteKey: this.siteKey }
    );
    
    return data?.result;
  }

  async getChallengeToken(cfToken, identity) {
    const inst = axios.create({
      baseURL: `${this.baseURL}/supawork/headshot/api`,
      headers: {
        authorization: "null",
        origin: `${this.baseURL}/`,
        referer: `${this.baseURL}/app`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "x-identity-id": identity
      }
    });

    const { data } = await inst.get("/sys/challenge/token", {
      headers: { "x-auth-challenge": cfToken }
    });

    return data?.data?.challenge_token;
  }

  async registerAccount(email, password, challengeToken, identity) {
    const inst = axios.create({
      baseURL: `${this.baseURL}/supawork/api`,
      headers: {
        origin: `${this.baseURL}/`,
        referer: `${this.baseURL}/app`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "x-identity-id": identity,
        "x-auth-challenge": challengeToken
      }
    });

    const { data } = await inst.post("/user/register", {
      email,
      password,
      register_code: "",
      credential: null,
      route_path: "/app",
      user_type: 1
    });

    return data?.data?.credential;
  }

  async getOTP(email) {
    for (let i = 0; i < 30; i++) {
      try {
        const { data: mails } = await axios.get(
          `${this.tempMailAPI}/email/${email}/messages`,
          {
            headers: {
              "Application-Name": "web",
              "Application-Version": "4.0.0",
              "X-CORS-Header": "iaWg3pchvFx48fY"
            }
          }
        );

        if (Array.isArray(mails) && mails.length > 0) {
          const body = mails[0].body_text || mails[0].body_html || "";
          const match = body.match(/\b\d{4,6}\b/);
          if (match) {
            return match[0];
          }
        }
      } catch (error) {
        console.error("Error fetching OTP:", error.message);
      }
      
      await this.delay(2000);
    }
    
    throw new Error("OTP timeout: Tidak mendapatkan kode verifikasi");
  }

  async verifyAccount(email, password, otp, credential, challengeToken, identity) {
    const inst = axios.create({
      baseURL: `${this.baseURL}/supawork/api`,
      headers: {
        origin: `${this.baseURL}/`,
        referer: `${this.baseURL}/app`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "x-identity-id": identity,
        "x-auth-challenge": challengeToken
      }
    });

    await inst.post("/user/register/code/verify", {
      email,
      password,
      register_code: otp,
      credential,
      route_path: "/app"
    });
  }

  async login(email, password, identity) {
    const inst = axios.create({
      baseURL: `${this.baseURL}/supawork/api`,
      headers: {
        origin: `${this.baseURL}/`,
        referer: `${this.baseURL}/app`,
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "x-identity-id": identity
      }
    });

    const { data } = await inst.post("/user/login/password", {
      email,
      password
    });

    return data?.data?.token;
  }

  async createAccount() {
    try {
      const identity = uuidv4();
      
      // 1. Generate email temporary
      const { email, password } = await this.generateTempEmail();
      console.log(`Generated email: ${email}`);
      
      // 2. Bypass Cloudflare untuk halaman app
      const cfToken = await this.bypassCloudflare(`${this.baseURL}/app`);
      if (!cfToken) throw new Error("Gagal bypass Cloudflare");
      
      // 3. Dapatkan challenge token
      const challengeToken = await this.getChallengeToken(cfToken, identity);
      if (!challengeToken) throw new Error("Gagal mendapatkan challenge token");
      
      // 4. Register akun
      const credential = await this.registerAccount(email, password, challengeToken, identity);
      if (!credential) throw new Error("Gagal registrasi akun");
      
      // 5. Dapatkan dan verifikasi OTP
      const otp = await this.getOTP(email);
      await this.verifyAccount(email, password, otp, credential, challengeToken, identity);
      
      // 6. Login dan dapatkan token
      const token = await this.login(email, password, identity);
      if (!token) throw new Error("Gagal login");
      
      return {
        success: true,
        account: { email, password, token, identity },
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error("Error creating account:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateImage(prompt, options = {}) {
    const {
      model = "text_to_image_generator",
      style = "realistic",
      aspectRatio = "1:1",
      useExistingAccount = true,
      customAccount = null
    } = options;

    let account = customAccount;

    // Jika tidak ada akun yang disediakan, buat akun baru
    if (!account || !useExistingAccount) {
      const accountResult = await this.createAccount();
      if (!accountResult.success) {
        throw new Error(`Gagal membuat akun: ${accountResult.error}`);
      }
      account = accountResult.account;
    }

    try {
      const identity = uuidv4();
      
      // Bypass Cloudflare untuk halaman nano-banana
      const cfToken = await this.bypassCloudflare(`${this.baseURL}/nano-banana`);
      if (!cfToken) throw new Error("Gagal bypass Cloudflare untuk generasi gambar");
      
      // Buat instance untuk generasi gambar
      const inst = axios.create({
        baseURL: `${this.baseURL}/supawork/headshot/api`,
        headers: {
          authorization: account.token,
          origin: `${this.baseURL}/`,
          referer: `${this.baseURL}/nano-banana`,
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "x-identity-id": identity
        }
      });

      // Dapatkan challenge token untuk generasi
      const challengeToken = await this.getChallengeToken(cfToken, identity);
      if (!challengeToken) throw new Error("Gagal mendapatkan challenge token untuk generasi");

      // Mapping style ke model yang sesuai
      const modelMap = {
        "realistic": "realistic_vision_v5",
        "anime": "anything_v5",
        "cartoon": "toon_you",
        "fantasy": "dreamshaper",
        "ghibli": "ghibli_style",
        "cyberpunk": "cyberrealistic"
      };

      const selectedModel = modelMap[style.toLowerCase()] || modelMap.realistic;

      // Generate gambar
      const { data: task } = await inst.post(
        "/media/image/generator",
        {
          identity_id: identity,
          aigc_app_code: model,
          model_code: selectedModel,
          custom_prompt: prompt,
          aspect_ratio: aspectRatio,
          currency_type: "gold",
          image_urls: [] // Kosong karena text-to-image
        },
        { headers: { "x-auth-challenge": challengeToken } }
      );

      const creationId = task?.data?.creation_id;
      if (!creationId) throw new Error("Gagal memulai generasi gambar");

      // Tunggu hasil generasi
      let resultUrl = null;
      let attempts = 0;
      const maxAttempts = 120; // Maksimal 2 menit

      while (attempts < maxAttempts && !resultUrl) {
        await this.delay(1000);
        
        try {
          const { data } = await inst.get("/media/aigc/result/list/v1", {
            params: {
              page_no: 1,
              page_size: 10,
              identity_id: identity
            }
          });

          const result = data?.data?.list?.[0]?.list?.find(item => item.creation_id === creationId);
          
          if (result?.status === 1) {
            resultUrl = result.url;
            break;
          } else if (result?.status === 2) {
            throw new Error("Generasi gambar gagal");
          }
        } catch (error) {
          console.error("Error checking result:", error.message);
        }
        
        attempts++;
      }

      if (!resultUrl) throw new Error("Timeout: Gambar belum selesai digenerate");

      return {
        success: true,
        image_url: resultUrl,
        prompt: prompt,
        style: style,
        aspect_ratio: aspectRatio,
        model: selectedModel,
        account_used: account.email,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error("Error generating image:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateMultipleImages(prompts, options = {}) {
    const results = [];
    
    for (const prompt of prompts) {
      const result = await this.generateImage(prompt, options);
      results.push(result);
      
      // Delay antara setiap generasi
      if (prompts.indexOf(prompt) < prompts.length - 1) {
        await this.delay(3000);
      }
    }
    
    return results;
  }
}

module.exports = SupaworkAI;
