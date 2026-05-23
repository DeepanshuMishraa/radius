cask "radius" do
  arch arm: "apple-silicon", intel: "intel"

  version "1.0.6"
  sha256 arm:   "1e7d7648d8ee47c755ef2a355baf15a27cf9fbfd510b42aaa1a8fee13b464f22",
         intel: "0bec7e8eb2da07db652d4d8c1efa214d57afc224ab2fca093d9b4aeb77633320"

  url "https://github.com/DeepanshuMishraa/radius/releases/download/v#{version}/radius-macos-#{arch}.dmg"
  name "Radius"
  desc "Minimal Email Client for your everyday needs"
  homepage "https://github.com/DeepanshuMishraa/radius"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: :big_sur

  app "Radius-canary.app"
end
