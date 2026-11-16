#!/usr/bin/env node
/**
 * Build do APK **100% local** — sem EAS, sem conta Expo, sem nuvem.
 *
 *   node scripts/build-apk.mjs            # incremental
 *   node scripts/build-apk.mjs --clean    # regenera android/ do zero
 *
 * Pré-requisitos (o script confere e explica o que falta):
 *   - JDK 17 (Expo SDK 58 não builda com 21 em todas as libs)
 *   - Android SDK com platform 36 + build-tools 36
 *
 * Saída: apps/mobile/dist/quanto-<versão>.apk, assinado com o keystore de
 * `credentials/release.keystore` (criado na primeira execução e reaproveitado
 * nas seguintes — trocar esse arquivo impede atualizar o app por cima).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(projectRoot, 'android');
const credentialsDir = join(projectRoot, 'credentials');
const keystorePath = join(credentialsDir, 'release.keystore');
const keystorePropsPath = join(credentialsDir, 'keystore.properties');
const distDir = join(projectRoot, 'dist');

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const skipPrebuild = args.includes('--no-prebuild');

const c = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  cyan: '\u001b[36m',
};

const step = (title) => console.log(`\n${c.bold}${c.cyan}▸ ${title}${c.reset}`);
const fail = (message, hint) => {
  console.error(`\n${c.red}✖ ${message}${c.reset}`);
  if (hint) console.error(`${c.dim}${hint}${c.reset}`);
  process.exit(1);
};

// ─────────────────────────────────────────────── 1. pré-requisitos

step('conferindo ambiente');

function pickJdk() {
  const candidates = [
    process.env.JAVA_HOME,
    '/usr/lib/jvm/java-17-openjdk',
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/temurin-17-jdk',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'bin/java'))) return candidate;
  }
  return null;
}

const javaHome = pickJdk();
if (!javaHome) {
  fail(
    'não achei um JDK 17',
    'instale (sudo apt install openjdk-17-jdk) ou exporte JAVA_HOME apontando para ele',
  );
}

const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? '';
if (!androidHome || !existsSync(androidHome)) {
  fail(
    'ANDROID_HOME não configurado',
    'exporte ANDROID_HOME=~/Android/Sdk (ou instale o Android SDK)',
  );
}

console.log(`  ${c.green}✓${c.reset} JAVA_HOME  ${javaHome}`);
console.log(`  ${c.green}✓${c.reset} ANDROID_HOME  ${androidHome}`);

// ─────────────────────────────────────────────── 2. keystore estável

step('assinatura');

mkdirSync(credentialsDir, { recursive: true });

if (!existsSync(keystorePath) || !existsSync(keystorePropsPath)) {
  const password = randomBytes(18).toString('base64url');
  const keytool = spawnSync(
    join(javaHome, 'bin/keytool'),
    [
      '-genkeypair',
      '-v',
      '-storetype', 'PKCS12',
      '-keystore', keystorePath,
      '-alias', 'quanto',
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-storepass', password,
      '-keypass', password,
      '-dname', 'CN=Quanto, OU=Casa, O=Leonnaviegas, L=Sao Paulo, ST=SP, C=BR',
    ],
    { encoding: 'utf8' },
  );

  if (keytool.status !== 0) fail('keytool falhou ao criar o keystore', keytool.stderr ?? '');

  writeFileSync(
    keystorePropsPath,
    [
      `# Gerado por scripts/build-apk.mjs — NÃO versione e NÃO perca este arquivo.`,
      `# Sem ele não dá para assinar uma atualização que instale por cima.`,
      `storeFile=${keystorePath}`,
      `storePassword=${password}`,
      `keyAlias=quanto`,
      `keyPassword=${password}`,
      '',
    ].join('\n'),
  );

  console.log(`  ${c.green}✓${c.reset} keystore criado em credentials/ (guarde junto com keystore.properties)`);
} else {
  console.log(`  ${c.green}✓${c.reset} keystore existente reaproveitado`);
}

const keystoreProps = Object.fromEntries(
  readFileSync(keystorePropsPath, 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

// ─────────────────────────────────────────────── 3. prebuild

if (!skipPrebuild) {
  step(`gerando projeto nativo${clean ? ' (limpo)' : ''}`);
  const result = spawnSync(
    'npx',
    ['expo', 'prebuild', '--platform', 'android', '--no-install', ...(clean ? ['--clean'] : [])],
    { cwd: projectRoot, stdio: 'inherit', env: { ...process.env, JAVA_HOME: javaHome } },
  );
  if (result.status !== 0) fail('expo prebuild falhou');
}

if (!existsSync(join(androidDir, 'app/build.gradle'))) {
  fail('android/app/build.gradle não existe — rode sem --no-prebuild');
}

// ─────────────────────────────────────────────── 4. memória e ABI

step('ajustando build (memória e ABI)');

const gradlePropsPath = join(androidDir, 'gradle.properties');
let gradleProps = readFileSync(gradlePropsPath, 'utf8');

// 4 ABIs com NDK estouram a memória do daemon; arm64-v8a cobre praticamente
// todo celular dos últimos anos. ABI=arm64-v8a,armeabi-v7a gera universal.
const abi = process.env.ABI ?? 'arm64-v8a';
const desired = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'org.gradle.parallel': 'false',
  'org.gradle.workers.max': '2',
  reactNativeArchitectures: abi,
};

for (const [key, value] of Object.entries(desired)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  gradleProps = pattern.test(gradleProps)
    ? gradleProps.replace(pattern, line)
    : `${gradleProps}\n${line}`;
}

writeFileSync(gradlePropsPath, gradleProps);
console.log(`  ${c.green}✓${c.reset} ABI ${abi} · heap 4 GB · sem build paralelo`);

// ─────────────────────────────────────────────── 5. assinatura de release

step('configurando assinatura de release');

const gradlePath = join(androidDir, 'app/build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');

if (!gradle.includes('QUANTO_SIGNING')) {
  // o template do Expo assina release com a chave de debug: trocar isso é o que
  // permite atualizar o APK instalado sem desinstalar
  const signingBlock = `    signingConfigs {
        // QUANTO_SIGNING
        release {
            def props = new Properties()
            file("${keystorePropsPath.replace(/\\/g, '/')}").withInputStream { props.load(it) }
            storeFile file(props['storeFile'])
            storePassword props['storePassword']
            keyAlias props['keyAlias']
            keyPassword props['keyPassword']
        }
        debug {`;

  if (!gradle.includes('    signingConfigs {\n        debug {')) {
    fail('não reconheci o bloco signingConfigs do build.gradle (template mudou?)');
  }

  gradle = gradle.replace('    signingConfigs {\n        debug {', signingBlock);

  const releaseAnchor = `            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

  if (!gradle.includes(releaseAnchor)) {
    fail('não reconheci o bloco release do build.gradle (template mudou?)');
  }

  gradle = gradle.replace(releaseAnchor, releaseAnchor.replace('signingConfigs.debug', 'signingConfigs.release'));
  writeFileSync(gradlePath, gradle);
  console.log(`  ${c.green}✓${c.reset} release agora assina com credentials/release.keystore`);
} else {
  console.log(`  ${c.green}✓${c.reset} assinatura de release já configurada`);
}

// ─────────────────────────────────────────────── 6. gradle

step('compilando (isso leva alguns minutos)');

const build = spawnSync(
  join(androidDir, 'gradlew'),
  ['assembleRelease', `-PreactNativeArchitectures=${process.env.ABI ?? 'arm64-v8a'}`, '--no-daemon', '--console=plain'],
  {
    cwd: androidDir,
    stdio: 'inherit',
    env: { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidHome },
  },
);

if (build.status !== 0) fail('gradlew assembleRelease falhou (veja o log acima)');

// ─────────────────────────────────────────────── 7. artefato

step('artefato');

const manifest = JSON.parse(readFileSync(join(projectRoot, 'app.json'), 'utf8'));
const version = manifest.expo.version ?? '0.0.0';

const apkSource = join(androidDir, 'app/build/outputs/apk/release/app-release.apk');
if (!existsSync(apkSource)) fail('APK não encontrado em app/build/outputs/apk/release/');

mkdirSync(distDir, { recursive: true });
const apkTarget = join(distDir, `quanto-${version}.apk`);
copyFileSync(apkSource, apkTarget);

const buffer = readFileSync(apkTarget);
const sha = createHash('sha256').update(buffer).digest('hex');
const sizeMb = (buffer.length / 1024 / 1024).toFixed(1);

console.log(`\n${c.green}${c.bold}✓ APK pronto${c.reset}`);
console.log(`  ${c.bold}${apkTarget}${c.reset}`);
console.log(`  ${sizeMb} MB · versão ${version} · pacote ${manifest.expo.android?.package ?? '—'}`);
console.log(`  sha256 ${sha}`);
console.log(`\n${c.dim}instalar: adb install -r "${apkTarget}"${c.reset}`);
console.log(`${c.yellow}guarde credentials/release.keystore${c.reset}${c.dim} — sem ele, atualizações exigem desinstalar${c.reset}\n`);
