import SwiftUI

public struct StaffLoginView: View {
    @Bindable private var auth: StaffAuthStore
    private let title: String
    @State private var username = ""
    @State private var password = ""

    public init(auth: StaffAuthStore, title: String) {
        self.auth = auth
        self.title = title
    }

    public var body: some View {
        ZStack {
            Design3.frame.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 16) {
                Image(systemName: "checklist").font(.system(size: 34, weight: .black)).foregroundStyle(Design3.lime)
                Text(title).font(.largeTitle.weight(.black)).foregroundStyle(.white)
                Text("Рабочее место для заказов, клиентов и смены").foregroundStyle(.secondary)
                VStack(spacing: 12) {
                    TextField("Логин", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    SecureField("Пароль", text: $password)
                        .textFieldStyle(.roundedBorder)
                }
                .padding(.top, 14)
                if let errorMessage = auth.errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.red)
                }
                Button {
                    Task { await auth.login(username: username.trimmingCharacters(in: .whitespaces), password: password) }
                } label: {
                    if auth.isLoading { ProgressView().frame(maxWidth: .infinity) }
                    else { Label("Войти в рабочее место", systemImage: "arrow.right.circle.fill").frame(maxWidth: .infinity) }
                }
                .buttonStyle(.borderedProminent).tint(Design3.lime).foregroundStyle(.black).controlSize(.large)
                .disabled(auth.isLoading || username.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
                Text("После первого входа можно использовать Face ID или PIN-код.").font(.caption).foregroundStyle(.secondary).padding(.top, 6)
            }
            .padding(28)
        }
    }
}
