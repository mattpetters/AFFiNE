import Capacitor
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  // Created by UIKit from the scene's storyboard (Main) before the scene connects.
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo _: UISceneSession, options: UIScene.ConnectionOptions) {
    // A cold launch from a URL or universal link delivers it here, not to the callbacks below.
    guard !options.urlContexts.isEmpty || !options.userActivities.isEmpty else { return }
    // Capacitor's App plugin listens for these; it exists once the web view controller's view has loaded.
    affineViewController?.loadViewIfNeeded()
    self.scene(scene, openURLContexts: options.urlContexts)
    for userActivity in options.userActivities {
      self.scene(scene, continue: userActivity)
    }
  }

  func sceneDidBecomeActive(_: UIScene) {
    affineViewController?.processShareInboxIfNeeded()
  }

  func scene(_: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      let url = context.url
      var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
      options[.sourceApplication] = context.options.sourceApplication
      options[.annotation] = context.options.annotation
      // Keep this call so the Capacitor App API keeps tracking app url opens.
      _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: options)
      if url.scheme == "affine", url.host == "share-inbox" {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
          self?.affineViewController?.processShareInboxIfNeeded()
        }
      }
    }
  }

  func scene(_: UIScene, continue userActivity: NSUserActivity) {
    // Universal Links. Keep this call so the Capacitor App API keeps tracking app url opens.
    _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity) { _ in }
  }

  private var affineViewController: AFFiNEViewController? {
    window?.rootViewController.flatMap(findAffineViewController(from:))
  }

  private func findAffineViewController(from root: UIViewController) -> AFFiNEViewController? {
    if let affine = root as? AFFiNEViewController {
      return affine
    }
    if let navigation = root as? UINavigationController {
      for controller in navigation.viewControllers {
        if let found = findAffineViewController(from: controller) {
          return found
        }
      }
    }
    for child in root.children {
      if let found = findAffineViewController(from: child) {
        return found
      }
    }
    if let presented = root.presentedViewController {
      return findAffineViewController(from: presented)
    }
    return nil
  }
}
